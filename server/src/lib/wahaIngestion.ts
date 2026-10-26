import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, conversations, conversationTags, messages } from '../db/schema.js';
import { cache } from './cache.js';
import { WahaService, type Inbox } from './waha.js';
import { attach } from './storage.js';
import { fotoPrecisaAtualizar, salvarFotoPerfil } from './avatars.js';
import { createMessage, rebroadcast, messageStatusValue, type Message } from './messages.js';
import { createContact, findByAnyPhone, setJidIfFree, updateContact, likeEscape, type Contact } from './contacts.js';
import { broadcastConversations } from './realtime.js';
import { onClientReply } from './pipelines.js';
import { conversationTagsOf, findOrCreateConversation, findOrCreateTag, addConversationTag, convStatusValue } from './conversations.js';

// Porte do WahaMessageIngestion da v1 — compartilhado entre o webhook (tempo real) e o
// WahaHistorySyncJob (histórico). Mesmo payload nos dois casos (evento message.any da WAHA).

const TIPOS_SISTEMA_SEM_CONTEUDO = ['notification_template', 'biz_content_placeholder', 'e2e_notification', 'gp2', 'call_log', 'ciphertext', 'protocol'];

export type WahaPayload = {
  id?: string; fromMe?: boolean; from?: string; to?: string; body?: string; timestamp?: number;
  hasMedia?: boolean; media?: { url?: string; mimetype?: string; filename?: string } | null;
  _data?: { type?: string; notifyName?: string } | null;
};

// --- ganchos das próximas fases (Fluxos e Agente de IA). Até serem registrados, não fazem nada.
type FlowHooks = {
  continueWithReply: (conv: typeof conversations.$inferSelect, text: string) => Promise<boolean>;
  triggerByKeyword: (inbox: Inbox, conv: typeof conversations.$inferSelect, contact: Contact, text: string) => Promise<boolean>;
};
let flowHooks: FlowHooks = { continueWithReply: async () => false, triggerByKeyword: async () => false };
export function setFlowHooks(h: FlowHooks) { flowHooks = h; }

type AiResponder = (inbox: Inbox, conv: typeof conversations.$inferSelect, chatId: string) => Promise<void>;
let aiResponder: AiResponder | null = null;
export function setAiResponder(fn: AiResponder) { aiResponder = fn; }
// Agente de IA (lib/aiAgent): a caixa também atende com IA quando um agente ativo usa esse canal.
let aiHandlesInbox: (inboxId: number) => Promise<boolean> = async () => false;
export function setAiInboxCheck(fn: (inboxId: number) => Promise<boolean>) { aiHandlesInbox = fn; }
// disparo em massa (lib/disparos registra): cliente respondeu / pediu pra sair
let respostaDisparo: (contactId: number, conversationId: number, texto: string) => Promise<void> = async () => {};
export function setBroadcastReplyHook(fn: typeof respostaDisparo) { respostaDisparo = fn; }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** handle_message da v1. Retorna a mensagem criada, ou null se já existia/foi ignorada. */
export async function handleMessage(inbox: Inbox, payload: WahaPayload, opts: { historical?: boolean } = {}): Promise<Message | null> {
  const historical = !!opts.historical;
  const sourceId = payload.id;
  if (!sourceId) return null;
  if (historical && await alreadyImported(inbox, payload)) return null;

  // id = "{fromMe}_{chatId}_{messageId}" — fonte mais confiável do chat (from/to são ambíguos)
  const idParts = String(sourceId).split('_');
  const chatId = idParts.length >= 3 ? idParts[1] : (payload.fromMe ? payload.to : payload.from);
  if (!chatId) return null;
  const isGroup = chatId.endsWith('@g.us');
  if (chatId === 'status@broadcast') return null; // Status/Stories, não é conversa

  const fromMe = !!payload.fromMe;
  let humanReplyViaPhone = false;

  if (fromMe && historical) {
    humanReplyViaPhone = true;
  } else if (fromMe) {
    if (await messageExists(sourceId)) return null; // eco do que o CRM/IA já salvou
    if (cache.read(`ai_is_replying_${inbox.id}_${chatId}`)) return null; // eco da IA/Fluxo em corrida
    if (cache.read(`sending_from_crm_${inbox.id}_${chatId}`)) return null; // eco do envio manual em corrida
    // eco da 1ª mensagem pra número novo: o contato ainda não tem jid (a trava acima não pega) e o
    // sourceId só é gravado depois do envio — reconhece pelo id real ou pelo mesmo texto em ±3 min
    if (await alreadyImported(inbox, payload)) return null;
    // intervenção humana real pelo celular: salva e pausa a IA
    humanReplyViaPhone = true;
    if (inbox.aiEnabled || await aiHandlesInbox(inbox.id)) {
      cache.write(`ai_paused_${inbox.id}_${chatId}`, Math.floor(Date.now() / 1000));
      void (async () => {
        try {
          const [conv] = await db.select({ id: conversations.id, accountId: conversations.accountId }).from(conversations)
            .innerJoin(contacts, eq(contacts.id, conversations.contactId))
            .where(and(eq(conversations.inboxId, inbox.id), eq(contacts.jid, chatId))).limit(1);
          if (conv) {
            const tag = await findOrCreateTag(conv.accountId, 'agente_off', '#f97316');
            await addConversationTag(conv.id, tag.id);
            broadcastConversations(conv.accountId, { event: 'conversation_tags_updated', conversation_id: conv.id, tags: await conversationTagsOf(conv.id) });
          }
        } catch (e) { console.error('Erro ao aplicar tag agente_off (Waha):', (e as Error).message); }
      })();
    }
  }

  if (await messageExists(sourceId)) return null;

  const tipoEvento = isObj(payload._data) ? payload._data.type : undefined;
  if (!String(payload.body ?? '').trim() && !payload.hasMedia && tipoEvento && TIPOS_SISTEMA_SEM_CONTEUDO.includes(tipoEvento)) {
    return null; // evento de protocolo do WhatsApp Business, sem conteúdo
  }

  const accountId = inbox.accountId!;
  const service = new WahaService(inbox);
  let contact: Contact | null;
  let contactPhoneFormatted: string;

  if (isGroup) {
    contact = await findByJid(accountId, chatId);
    if (!contact) {
      const groupName = await service.fetchGroupName(chatId);
      try {
        contact = await createContact({ accountId, jid: chatId, status: 'grupo', source: 'WhatsApp', name: groupName || `Grupo ${chatId.split('@')[0]}` });
      } catch {
        contact = await findByJid(accountId, chatId);
      }
    }
    contactPhoneFormatted = contact?.name ?? '';
  } else {
    let resolvedNumber: string | null = null;
    let resolvedName: string | null = null;
    if (chatId.endsWith('@lid')) {
      const resolved = await service.resolveContact(chatId);
      if (resolved?.id) {
        resolvedNumber = String(resolved.id).split('@')[0];
        const saved = resolved.name || null;
        if (saved && saved !== resolved.number) resolvedName = saved;
        resolvedName ||= resolved.pushname || null;
      }
    }
    const contactPhone = resolvedNumber || chatId.split('@')[0];
    contactPhoneFormatted = /^\d+$/.test(contactPhone) ? `+${contactPhone}` : contactPhone;

    contact = await findByAnyPhone(accountId, contactPhoneFormatted);
    contact ||= await findByJid(accountId, chatId);
    if (!contact) {
      try {
        contact = await createContact({
          accountId, phone: contactPhoneFormatted, jid: chatId, source: 'WhatsApp',
          // notifyName é o nome de quem MANDOU: em mensagem nossa (fromMe) é o nome do próprio WhatsApp da loja
          name: resolvedName || (!fromMe && isObj(payload._data) ? payload._data.notifyName || null : null) || contactPhoneFormatted,
        });
      } catch {
        // 2 webhooks do mesmo chat em paralelo: quem perdeu a corrida busca de novo
        contact = (await findByAnyPhone(accountId, contactPhoneFormatted)) || (await findByJid(accountId, chatId));
      }
    }
  }
  if (!contact) return null;

  if (contact.status === 'blocked') return null;

  // contato que ficou só com o telefone como nome ganha o nome do WhatsApp quando o cliente escreve
  const nomeWhats = !fromMe && !isGroup && isObj(payload._data) ? String(payload._data.notifyName || '').trim() : '';
  if (nomeWhats && !contact.idJueri && (!contact.name || contact.name === contactPhoneFormatted || contact.name === contact.phone)) {
    contact = await updateContact(contact, { name: nomeWhats });
  }

  contact = await setJidIfFree(contact, chatId);

  if (chatId.endsWith('@lid') && !historical) void autoCuraLid(inbox, contact, chatId, contactPhoneFormatted, accountId);

  // foto de perfil: baixa e guarda no CRM (o link do WhatsApp expira e a foto sumia da tela)
  if (fotoPrecisaAtualizar(contact) && !historical) {
    const c = contact;
    void service.fetchProfilePictureUrl(chatId).then(url => (url ? salvarFotoPerfil(c, url) : null))
      .catch(e => console.error('Failed to fetch profile picture (Waha):', e.message));
  }

  // caixa por carteira: conversa nova já nasce com a dona da revendedora como atendente
  const conversation = await findOrCreateConversation(contact.id, inbox.id, { accountId, status: 0, userId: inbox.restrictByPortfolio ? contact.userId : null });
  const text = String(payload.body ?? '');
  const media = isObj(payload.media) ? payload.media : null;
  // com mídia, a v1 já mostrava a bolha na hora e reenviava quando o arquivo terminava de baixar
  const mediaInBackground = !historical && !!(payload.hasMedia && media?.url);

  const record = await createMessage({
    accountId: conversation.accountId,
    conversationId: conversation.id,
    text,
    senderType: humanReplyViaPhone ? 'User' : 'Contact',
    senderId: humanReplyViaPhone ? null : contact.id,
    sourceId,
    status: messageStatusValue('delivered'),
    ...(historical && Number(payload.timestamp) > 0 ? { createdAt: new Date(Number(payload.timestamp) * 1000), updatedAt: new Date(Number(payload.timestamp) * 1000) } : {}),
  }, { historical, skipBroadcast: !mediaInBackground });

  if (historical) {
    await attachHistoricalMedia(service, record, payload);
    return record;
  }

  if (mediaInBackground) {
    // download em background, com tentativas e timeout curto (nunca segura o webhook)
    void (async () => {
      try {
        let data: Buffer | null = null;
        for (const wait of [0, 2, 4]) {
          if (wait) await sleep(wait * 1000);
          data = await service.downloadMedia(media!.url!, 10000);
          if (data) break;
        }
        const mimetype = media!.mimetype || 'application/octet-stream';
        let finalText = record.text;
        if (data) {
          const ext = mimetype.split('/').pop()?.split(';')[0] || 'bin';
          await attach('Message', record.id, 'attachment', data, media!.filename || `${sourceId}.${ext}`, mimetype);
          // (transcrição automática de áudio com IA: entra junto com o Agente de IA)
          if (!finalText) finalText = '📎 Anexo recebido';
        } else if (!finalText) {
          finalText = '📎 Arquivo não pôde ser baixado';
        }
        if (finalText !== record.text) await db.update(messages).set({ text: finalText, updatedAt: new Date() }).where(eq(messages.id, record.id));
        await rebroadcast(record.id);
      } catch (e) {
        console.error(`Erro fatal no download de mídia (Waha) para ${sourceId}:`, (e as Error).message);
      }
    })();
  } else if (!record.text) {
    await db.update(messages).set({ text: '📎 Arquivo não suportado ou vazio', updatedAt: new Date() }).where(eq(messages.id, record.id));
  }
  if (!mediaInBackground) await rebroadcast(record.id);

  if (!fromMe && !isGroup) void respostaDisparo(contact.id, conversation.id, text).catch(e => console.error('Resposta de disparo —', e.message));

  // Gatilhos 'quando o cliente responder' dos funis — em segundo plano, nunca atrasa o recebimento.
  if (!fromMe && !isGroup) void onClientReply(contact.id).catch(e => console.error('Gatilho client_reply falhou —', e.message));

  // Fluxos (resposta pendente ou gatilho por palavra-chave). Grupo nunca aciona Fluxo nem IA.
  const flowHandled = !humanReplyViaPhone && !fromMe && !isGroup && (
    (await flowHooks.continueWithReply(conversation, text)) ||
    (await flowHooks.triggerByKeyword(inbox, conversation, contact, text)));

  if (!humanReplyViaPhone && !flowHandled && !isGroup && (inbox.aiEnabled || await aiHandlesInbox(inbox.id))) {
    await aiEngine(inbox, conversation, contact, chatId);
  }
  return record;
}

/** Bloco "MOTOR DE IA" da v1: reabre a conversa e agenda a resposta com debounce de 8s. */
async function aiEngine(inbox: Inbox, conversation: typeof conversations.$inferSelect, contact: Contact, chatId: string) {
  if (cache.read(`ai_paused_${inbox.id}_${chatId}`)) return;
  const status = conversation.status;
  if (status === convStatusValue('resolved')) {
    await db.update(conversations).set({ status: 0 }).where(eq(conversations.id, conversation.id));
    const atuais = await conversationTagsOf(conversation.id);
    const remover = atuais.filter(t => ['agente_off', 'com_atendente'].includes(t.name));
    for (const t of remover) await db.delete(conversationTags).where(and(eq(conversationTags.conversationId, conversation.id), eq(conversationTags.tagId, t.id)));
    broadcastConversations(conversation.accountId, { event: 'conversation_updated', conversation: { id: conversation.id, status: 'open', snoozed_until: null } });
    if (remover.length) broadcastConversations(conversation.accountId, { event: 'conversation_tags_updated', conversation_id: conversation.id, tags: await conversationTagsOf(conversation.id) });
  } else if (status === convStatusValue('snoozed')) {
    await db.update(conversations).set({ status: 0, snoozedUntil: null }).where(eq(conversations.id, conversation.id));
    broadcastConversations(conversation.accountId, { event: 'snooze_expired', conversation_id: conversation.id, contact_name: contact.name || contact.phone, reason: 'client_message' });
    broadcastConversations(conversation.accountId, { event: 'conversation_updated', conversation: { id: conversation.id, status: 'open', snoozed_until: null } });
  }
  if (!aiResponder) return;
  const key = `debounce_ai_${inbox.id}_${chatId}`;
  const now = Date.now() + Math.random();
  cache.write(key, now);
  const responder = aiResponder;
  setTimeout(() => {
    if (cache.read(key) === now) responder(inbox, conversation, chatId).catch(e => console.error('Erro fatal no Agente de IA (Waha):', e.message));
  }, 8000);
}

async function autoCuraLid(inbox: Inbox, contact: Contact, chatId: string, phoneFormatted: string, accountId: number) {
  try {
    const service = new WahaService(inbox);
    const lidDigits = chatId.split('@')[0];
    let c = contact;
    if (c.phone === `+${lidDigits}`) {
      const r = await service.resolveContact(chatId);
      const real = r?.id ? String(r.id).split('@')[0] : null;
      if (real && real !== lidDigits) {
        const updates: Partial<Contact> = { phone: `+${real}` };
        if (c.name === phoneFormatted) {
          let saved = r?.name || null;
          if (saved === r?.number) saved = null;
          updates.name = saved || r?.pushname || updates.phone!;
        }
        c = await updateContact(c, updates);
      }
    }
    const match = await findByAnyPhone(accountId, c.phone);
    if (match && match.id !== c.id) {
      // já existe o cadastro de verdade (ex: do Jueri): move a conversa pra ele e apaga o duplicado
      if (match.jid !== chatId) {
        await db.update(contacts).set({ jid: null }).where(eq(contacts.id, c.id));
        await updateContact(match, { jid: chatId });
      }
      await db.update(conversations).set({ contactId: match.id }).where(eq(conversations.contactId, c.id));
      await deleteContactCascade(c.id);
    }
  } catch (e) {
    console.error(`Failed to re-resolve/merge lid contact (Waha) for ${chatId}:`, (e as Error).message);
  }
}

/** contact.destroy com os dependent: :destroy da v1 (conversas já movidas antes). */
export async function deleteContactCascade(contactId: number) {
  const tables = ['notes', 'pipeline_cards', 'reseller_phones', 'tarefas', 'contact_tags', 'contact_audit_events', 'flow_runs'];
  const convIds = (await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, contactId))).map(r => r.id);
  for (const id of convIds) await deleteConversationCascade(id);
  await db.execute(sql`DELETE FROM lifecycle_events WHERE contact_id = ${contactId}`);
  await db.execute(sql`DELETE FROM pedidos WHERE contact_id = ${contactId}`);
  for (const t of tables) await db.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE contact_id = ${contactId}`);
  await db.execute(sql`UPDATE agendamentos SET contact_id = NULL WHERE contact_id = ${contactId}`);
  await db.execute(sql`UPDATE jueri_activities SET contact_id = NULL WHERE contact_id = ${contactId}`);
  await db.delete(contacts).where(eq(contacts.id, contactId));
}

/** conversation.destroy! — mensagens, agendadas, etiquetas e execuções de fluxo vão junto. */
export async function deleteConversationCascade(conversationId: number) {
  await db.execute(sql`DELETE FROM flow_runs WHERE conversation_id = ${conversationId}`);
  await db.execute(sql`DELETE FROM scheduled_messages WHERE conversation_id = ${conversationId}`);
  await db.execute(sql`DELETE FROM conversation_tags WHERE conversation_id = ${conversationId}`);
  await db.execute(sql`DELETE FROM messages WHERE conversation_id = ${conversationId}`);
  await db.execute(sql`DELETE FROM conversations WHERE id = ${conversationId}`);
}

async function findByJid(accountId: number, jid: string): Promise<Contact | null> {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, accountId), eq(contacts.jid, jid))).limit(1);
  return c ?? null;
}

async function messageExists(sourceId: string) {
  const [m] = await db.select({ id: messages.id }).from(messages).where(eq(messages.sourceId, sourceId)).limit(1);
  return !!m;
}

/**
 * already_imported? da v1: mesmo envio tem ids diferentes ao vivo (@c.us) e no histórico (@lid),
 * então compara também pelo 3º pedaço (id real da mensagem), e por texto ±3min pro que o CRM
 * mandou sem receber o id da WAHA.
 */
export async function alreadyImported(inbox: Inbox, payload: WahaPayload): Promise<boolean> {
  const sourceId = String(payload.id ?? '');
  if (await messageExists(sourceId)) return true;
  const key = sourceId.split('_')[2] ?? '';
  if (key.length >= 10) {
    const k = likeEscape(key);
    const [m] = await db.select({ id: messages.id }).from(messages).where(and(
      eq(messages.accountId, inbox.accountId!),
      sql`(${messages.sourceId} LIKE ${'%\\_' + k} OR ${messages.sourceId} LIKE ${'%\\_' + k + '\\_%'})`)).limit(1);
    if (m) return true;
  }
  if (payload.fromMe && payload.body && Number(payload.timestamp) > 0) {
    const sentAt = Number(payload.timestamp) * 1000;
    const [m] = await db.select({ id: messages.id }).from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.inboxId, inbox.id), eq(messages.senderType, 'User'), eq(messages.text, String(payload.body)),
        gte(messages.createdAt, new Date(sentAt - 180000)), lte(messages.createdAt, new Date(sentAt + 180000)))).limit(1);
    if (m) return true;
  }
  return false;
}

async function attachHistoricalMedia(service: WahaService, record: Message, payload: WahaPayload) {
  const media = isObj(payload.media) ? payload.media : null;
  let attached = false;
  if (payload.hasMedia && media?.url) {
    const data = await service.downloadMedia(media.url, 20000);
    if (data) {
      const mimetype = media.mimetype || 'application/octet-stream';
      const ext = mimetype.split('/').pop()?.split(';')[0] || 'bin';
      await attach('Message', record.id, 'attachment', data, media.filename || `${String(record.sourceId).split('_')[2]}.${ext}`, mimetype);
      attached = true;
    }
  }
  if (!record.text) {
    const t = attached ? '📎 Anexo recebido' : (payload.hasMedia ? '📎 Arquivo não pôde ser baixado' : '📎 Arquivo não suportado ou vazio');
    await db.update(messages).set({ text: t }).where(eq(messages.id, record.id));
  }
}
