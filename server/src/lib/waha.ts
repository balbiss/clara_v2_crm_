import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cache } from './cache.js';
import type { inboxes } from '../db/schema.js';

// Porte do WhatsappWahaService da v1 (mesma interface, mesmo comportamento).
//
// SEGURANÇA: diferente da v1, NÃO existe URL padrão apontando pra WAHA de produção.
// - WAHA_URL / WAHA_API_KEY no .env definem a instância.
// - WAHA_FORCE_ENV=true ignora inboxes.api_url/api_key gravados no banco (depois de copiar os
//   dados da produção, as caixas trazem a URL da WAHA real — localmente isso NUNCA pode ser usado,
//   senão um "desconectar" de teste derrubaria a sessão de verdade).
// Sem URL configurada, toda chamada vira no-op (retorna nulo/false) e o resto do CRM segue.
export type Inbox = typeof inboxes.$inferSelect;

export interface Attachment { data: Buffer; contentType: string; filename: string }

type Json = Record<string, unknown>;

export class WahaService {
  readonly session: string;
  private apiUrl: string;
  private apiKey: string;

  constructor(private inbox: Inbox) {
    const force = process.env.WAHA_FORCE_ENV === 'true';
    this.apiUrl = ((force ? '' : inbox.apiUrl) || process.env.WAHA_URL || '').replace(/\/$/, '');
    this.apiKey = (force ? '' : inbox.apiKey) || process.env.WAHA_API_KEY || '';
    // WAHA_SESSION_PREFIX separa as sessões deste CRM das de outro CRM no mesmo servidor WAHA
    // (a v2 de validação usa "clarav2_" pra nunca mexer nas sessões "waha_" da v1 em produção)
    this.session = (process.env.WAHA_SESSION_PREFIX || 'waha_') + String(inbox.phoneNumber || '').replace(/\D/g, '');
  }

  get configured() { return !!this.apiUrl; }
  get mediaApiKey() { return this.apiKey; }

  private async request(method: string, path: string, body?: unknown, timeoutMs = 15000): Promise<Response | null> {
    if (!this.apiUrl) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(this.apiUrl + path, {
        method,
        headers: { 'X-Api-Key': this.apiKey, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  private async json<T = Json>(res: Response | null): Promise<T | null> {
    if (!res?.ok) return null;
    try { return await res.json() as T; } catch { return null; }
  }

  async createConnection(webhookUrl: string): Promise<boolean> {
    cache.delete(`inbox:${this.inbox.id}:status`);
    const body = { name: this.session, start: true, config: { webhooks: [{ url: webhookUrl, events: ['message.any', 'session.status'] }] } };
    try {
      const res = await this.request('POST', '/api/sessions', body);
      if (res?.status === 422) {
        // sessão já existe (reconexão): atualiza config e garante que está rodando
        const { name: _n, ...rest } = body;
        await this.request('PUT', `/api/sessions/${this.session}`, rest);
        await this.request('POST', `/api/sessions/${this.session}/start`, {});
        return true;
      }
      return !!res?.ok;
    } catch (e) {
      console.error('Waha createConnection error:', (e as Error).message);
      return false;
    }
  }

  async resolveJid(phone: string): Promise<string | null> {
    let digits = phone.replace(/\D/g, '');
    if (!digits.startsWith('55')) digits = '55' + digits;
    try {
      const data = await this.json<{ numberExists?: boolean; chatId?: string }>(
        await this.request('GET', `/api/contacts/check-exists?session=${this.session}&phone=${digits}`));
      return data?.numberExists ? data.chatId ?? null : null;
    } catch { return null; }
  }

  /** check-exists com resposta de 3 estados (disparo): número tem WhatsApp (com o chatId certo, ex.
   *  com/sem o 9), não tem, ou não deu pra saber (WAHA fora/lenta → tentar de novo depois). */
  async checkNumber(phone: string): Promise<{ exists: boolean | null; chatId: string | null }> {
    let digits = phone.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11) digits = '55' + digits;
    try {
      const res = await this.request('GET', `/api/contacts/check-exists?session=${this.session}&phone=${digits}`, undefined, 20000);
      if (!res?.ok) return { exists: null, chatId: null };
      const data = await res.json() as { numberExists?: boolean; chatId?: string };
      return { exists: !!data.numberExists, chatId: data.numberExists ? data.chatId ?? null : null };
    } catch { return { exists: null, chatId: null }; }
  }

  /** Envia texto ou anexo. Retorna o id serializado da mensagem na WAHA (vira source_id). */
  async sendMessage(recipient: string, text: string | null, attachment?: Attachment | null): Promise<string | null> {
    if (!this.apiUrl) return null; // WAHA não configurada (ambiente local)
    const chatId = normalizeJid(recipient);
    try {
      let res: Response | null;
      if (attachment) {
        let { data, contentType, filename } = attachment;
        // WhatsApp não entrega nota de voz que não seja ogg/opus (o navegador grava webm):
        // converte com ffmpeg; se falhar, segue com o original (mesmo comportamento da v1).
        if (contentType.startsWith('audio/') && !contentType.includes('ogg')) {
          const converted = await convertToOggOpus(data);
          if (converted) {
            data = converted;
            contentType = 'audio/ogg; codecs=opus';
            filename = filename.replace(/\.\w+$/, '') + '.ogg';
          }
        }
        // vídeo do iPhone (.mov/quicktime) e outros formatos: o WhatsApp só aceita mp4 (H.264) e a WAHA
        // devolvia 422 — converte antes; se a conversão falhar, vai como arquivo (documento)
        let videoComoArquivo = false;
        if (contentType.startsWith('video/') && !/mp4/.test(contentType)) {
          const mp4 = await convertToMp4(data);
          if (mp4) { data = mp4; contentType = 'video/mp4'; filename = filename.replace(/\.\w+$/, '') + '.mp4'; }
          else videoComoArquivo = true;
        }
        const payload: Json = { session: this.session, chatId, file: { mimetype: contentType, filename, data: data.toString('base64') } };
        if (text && text.trim()) payload.caption = text;
        let endpoint = '/api/sendFile';
        if (contentType.startsWith('image/')) endpoint = '/api/sendImage';
        else if (contentType.startsWith('audio/')) { endpoint = '/api/sendVoice'; payload.ptt = true; delete payload.caption; }
        else if (contentType.startsWith('video/') && !videoComoArquivo) endpoint = '/api/sendVideo';
        res = await this.request('POST', endpoint, payload, 120000);
        // imagem/vídeo que o WhatsApp recusa (HEIC, formato estranho, grande demais) vai como documento —
        // menos se a sessão caiu ("Session status is not as expected"): aí não adianta tentar de novo
        const sessaoCaiu = !res?.ok && /Session status/i.test((await res?.clone().text().catch(() => '')) || '');
        if (!res?.ok && !sessaoCaiu && (endpoint === '/api/sendImage' || endpoint === '/api/sendVideo')) {
          console.warn(`Waha ${endpoint} falhou (${res?.status}), reenviando como arquivo`);
          res = await this.request('POST', '/api/sendFile', payload, 120000);
        }
        if (!res?.ok) console.warn(`Waha ${endpoint} falhou (${res?.status}):`, (await res?.clone().text().catch(() => ''))?.slice(0, 300));
      } else {
        res = await this.request('POST', '/api/sendText', { session: this.session, chatId, text });
      }
      const parsed = await this.json<{ id?: { _serialized?: string }; _data?: { id?: { _serialized?: string } } }>(res);
      if (!parsed) console.warn('Waha sendMessage falhou:', res?.status);
      return parsed?.id?._serialized || parsed?._data?.id?._serialized || null;
    } catch (e) {
      console.error('Waha sendMessage error:', (e as Error).message);
      return null;
    }
  }

  /** Nó "Enviar mídia" dos Fluxos — a WAHA baixa o arquivo da URL. */
  async sendMediaByUrl(recipient: string, url: string, mediaType: string, caption?: string | null): Promise<string | null> {
    const chatId = normalizeJid(recipient);
    const filename = (new URL(url).pathname.split('/').pop()) || 'arquivo';
    const endpoint = ({ image: '/api/sendImage', video: '/api/sendVideo', audio: '/api/sendVoice', document: '/api/sendFile' } as Record<string, string>)[mediaType] || '/api/sendFile';
    const payload: Json = { session: this.session, chatId, file: { url, filename } };
    if (caption && mediaType !== 'audio') payload.caption = caption;
    if (mediaType === 'audio') payload.ptt = true;
    try {
      const parsed = await this.json<{ id?: { _serialized?: string }; _data?: { id?: { _serialized?: string } } }>(await this.request('POST', endpoint, payload, 40000));
      return parsed?.id?._serialized || parsed?._data?.id?._serialized || null;
    } catch { return null; }
  }

  async fetchRecentChats(limit = 200): Promise<Json[]> {
    try {
      return (await this.json<Json[]>(await this.request('GET', `/api/${this.session}/chats?limit=${limit}&sortBy=conversationTimestamp&sortOrder=desc`, undefined, 60000))) ?? [];
    } catch { return []; }
  }

  async fetchChatMessages(chatId: string, since: number, limit = 100, downloadMedia = false): Promise<Json[]> {
    const q = `limit=${limit}&downloadMedia=${downloadMedia}&filter.timestamp.gte=${Math.floor(since)}`;
    try {
      return (await this.json<Json[]>(await this.request('GET', `/api/${this.session}/chats/${encodeURIComponent(chatId)}/messages?${q}`, undefined, 60000))) ?? [];
    } catch { return []; }
  }

  async fetchGroupName(groupJid: string): Promise<string | null> {
    try {
      const data = await this.json<{ groupMetadata?: { subject?: string } }>(await this.request('GET', `/api/${this.session}/groups/${encodeURIComponent(groupJid)}`));
      return data?.groupMetadata?.subject || null;
    } catch { return null; }
  }

  async sendPresenceUpdate(recipient: string, presence: 'composing' | 'paused' = 'composing'): Promise<boolean> {
    try {
      const res = await this.request('POST', presence === 'composing' ? '/api/startTyping' : '/api/stopTyping', { session: this.session, chatId: normalizeJid(recipient) });
      return !!res?.ok;
    } catch { return false; }
  }

  /** Resolve um "@lid" (id de privacidade) pro contato real: {id, number, name, pushname}. */
  async resolveContact(contactId: string): Promise<{ id?: string; number?: string; name?: string; pushname?: string } | null> {
    try {
      return await this.json(await this.request('GET', `/api/contacts?session=${this.session}&contactId=${encodeURIComponent(contactId)}`));
    } catch { return null; }
  }

  async fetchProfilePictureUrl(contactId: string): Promise<string | null> {
    try {
      const data = await this.json<{ profilePictureURL?: string; profilePictureUrl?: string; url?: string }>(
        await this.request('GET', `/api/contacts/profile-picture?session=${this.session}&contactId=${encodeURIComponent(normalizeJid(contactId))}`));
      return data?.profilePictureURL || data?.profilePictureUrl || data?.url || null;
    } catch { return null; }
  }

  /** QR ao vivo (a WAHA devolve o PNG), como data URL. */
  async fetchQrCode(): Promise<string | null> {
    try {
      const res = await this.request('GET', `/api/${this.session}/auth/qr`);
      if (!res?.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
    } catch { return null; }
  }

  async connected(): Promise<boolean> {
    try {
      const data = await this.json<{ status?: string }>(await this.request('GET', `/api/sessions/${this.session}`));
      return data?.status === 'WORKING';
    } catch { return false; }
  }

  async sendRawDocument(jid: string, opts: { filename: string; mimetype: string; data: Buffer; caption?: string }): Promise<boolean> {
    const payload: Json = { session: this.session, chatId: normalizeJid(jid), file: { mimetype: opts.mimetype, filename: opts.filename, data: opts.data.toString('base64') } };
    if (opts.caption) payload.caption = opts.caption;
    try { return !!(await this.request('POST', '/api/sendFile', payload, 40000))?.ok; } catch { return false; }
  }

  async sendRawImage(jid: string, opts: { data: Buffer; caption?: string }): Promise<boolean> {
    const payload: Json = { session: this.session, chatId: normalizeJid(jid), file: { mimetype: 'image/png', filename: 'image.png', data: opts.data.toString('base64') } };
    if (opts.caption) payload.caption = opts.caption;
    try { return !!(await this.request('POST', '/api/sendImage', payload, 40000))?.ok; } catch { return false; }
  }

  /** Equivale a "sair" do WhatsApp: apaga a sessão na WAHA (reconectar pede QR novo). */
  async deleteConnection(): Promise<boolean> {
    cache.delete(`inbox:${this.inbox.id}:status`);
    try { return !!(await this.request('DELETE', `/api/sessions/${this.session}`))?.ok; } catch { return false; }
  }

  /** Baixa a mídia servida pela própria WAHA (exige a API key). */
  async downloadMedia(url: string, timeoutMs = 10000): Promise<Buffer | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey }, signal: ctrl.signal });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length ? buf : null;
    } catch { return null; } finally { clearTimeout(t); }
  }
}

export function normalizeJid(phoneOrId: string): string {
  if (String(phoneOrId).includes('@')) return phoneOrId;
  let digits = String(phoneOrId).replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = '55' + digits;
  return digits + '@c.us';
}

export const WHATSAPP_PROVIDERS = ['waha'] as const;

/** Inbox#messaging_service — na v2 só existe WAHA. */
export function messagingService(inbox: Inbox): WahaService {
  return new WahaService(inbox);
}

/**
 * Qualquer vídeo → mp4 H.264/AAC que o WhatsApp toca (no máx. 1280 px). Usa arquivo temporário porque
 * .mov do iPhone guarda o índice no fim do arquivo e o ffmpeg não lê isso por pipe.
 */
async function convertToMp4(input: Buffer): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vid-'));
  const src = path.join(dir, 'in'), out = path.join(dir, 'out.mp4');
  try {
    await fs.writeFile(src, input);
    const code = await new Promise<number | null>(resolve => {
      const ff = spawn('ffmpeg', ['-y', '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
        '-vf', "scale='min(1280,iw)':-2", '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
      const t = setTimeout(() => ff.kill('SIGKILL'), 180000);
      ff.on('error', () => { clearTimeout(t); resolve(null) });
      ff.on('close', c => { clearTimeout(t); resolve(c) });
    });
    return code === 0 ? await fs.readFile(out) : null;
  } catch { return null; } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

function convertToOggOpus(input: Buffer): Promise<Buffer | null> {
  return new Promise(resolve => {
    try {
      const ff = spawn('ffmpeg', ['-y', '-i', 'pipe:0', '-c:a', 'libopus', '-f', 'ogg', 'pipe:1']);
      const chunks: Buffer[] = [];
      ff.stdout.on('data', c => chunks.push(c));
      ff.on('error', () => resolve(null));
      ff.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
      ff.stdin.on('error', () => {});
      ff.stdin.end(input);
    } catch { resolve(null); }
  });
}
