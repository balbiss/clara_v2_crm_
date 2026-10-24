import { and, eq, isNotNull, or, isNull, like, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, conversations, inboxes } from '../db/schema.js';
import { attach, blobUrl, purge } from './storage.js';
import { messagingService } from './waha.js';
import { updateContact, type Contact } from './contacts.js';

// Foto de perfil do WhatsApp: o link que a WAHA devolve (pps.whatsapp.net) expira em poucos dias e
// aí a foto some da tela (403). Aqui a foto é baixada e guardada no armazenamento do CRM, com link
// próprio que não expira; fotos com link vencido são renovadas aos poucos pelo relógio.

const temporaria = (url?: string | null) => !url || /whatsapp\.net|\.fbcdn\.net/.test(url);

/** Baixa a foto (URL temporária do WhatsApp) e guarda como avatar do contato. */
export async function salvarFotoPerfil(c: Contact, urlTemporaria: string) {
  const r = await fetch(urlTemporaria, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const tipo = r.headers.get('content-type') || 'image/jpeg';
  if (!tipo.startsWith('image/')) return null;
  const dados = Buffer.from(await r.arrayBuffer());
  await purge('Contact', c.id, 'avatar').catch(() => {});
  const blob = await attach('Contact', c.id, 'avatar', dados, `perfil_${c.id}.jpg`, tipo);
  return updateContact(c, { avatarUrl: blobUrl(blob) });
}

/** Busca na WAHA (pela caixa da conversa) e salva. Sem foto pública = deixa como está. */
export async function atualizarFotoPerfil(c: Contact, inboxId?: number | null) {
  if (!c.jid) return null;
  let inbox = inboxId ? (await db.select().from(inboxes).where(eq(inboxes.id, inboxId)))[0] : undefined;
  if (!inbox) {
    const [conv] = await db.select({ inboxId: conversations.inboxId }).from(conversations).where(and(eq(conversations.contactId, c.id), isNotNull(conversations.inboxId))).limit(1);
    if (conv?.inboxId) inbox = (await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)))[0];
  }
  if (!inbox || inbox.provider !== 'waha') return null;
  const url = await messagingService(inbox).fetchProfilePictureUrl(c.jid);
  return url ? salvarFotoPerfil(c, url) : null;
}

export const fotoPrecisaAtualizar = (c: Pick<Contact, 'avatarUrl'>) => temporaria(c.avatarUrl);

/** Relógio: renova até 40 fotos por rodada (contatos com conversa e foto ausente ou com link temporário). */
export async function renovarFotosPerfil() {
  const lista = await db.select().from(contacts).where(and(
    isNotNull(contacts.jid),
    or(isNull(contacts.avatarUrl), like(contacts.avatarUrl, '%whatsapp.net%'), like(contacts.avatarUrl, '%fbcdn.net%')),
    sql`EXISTS (SELECT 1 FROM conversations cv JOIN inboxes i ON i.id = cv.inbox_id WHERE cv.contact_id = ${contacts.id} AND i.provider = 'waha')`,
  )).limit(40);
  let ok = 0;
  for (const c of lista) { try { if (await atualizarFotoPerfil(c)) ok++ } catch { /* sem foto ou caixa fora do ar: tenta na próxima */ } }
  if (ok) console.log(`[Fotos] ${ok} foto(s) de perfil salvas`);
}
