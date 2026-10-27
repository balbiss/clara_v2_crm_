import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activeStorageBlobs } from '../db/schema.js';
import { openBlob, verifyBlobSignature } from '../lib/storage.js';

// Proxy dos anexos (equivalente ao rails_storage_proxy_url da v1): o MinIO fica sem acesso
// público e o arquivo sai pelo domínio da API, com assinatura na URL.
export const filesRouter = Router();

filesRouter.get('/files/:id/:sig/:filename', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || !verifyBlobSignature(id, req.params.sig)) return res.status(404).end();
  const [blob] = await db.select().from(activeStorageBlobs).where(eq(activeStorageBlobs.id, id)).limit(1);
  if (!blob) return res.status(404).end();
  const total = Number(blob.byteSize);
  // pedaço do arquivo (Range): o player de áudio/vídeo pede assim — o Safari/iPhone só toca com isso
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let ini = 0, fim = total - 1;
  if (m && total > 0) {
    if (m[1]) { ini = Number(m[1]); if (m[2]) fim = Math.min(Number(m[2]), total - 1) }
    else if (m[2]) ini = Math.max(0, total - Number(m[2]));
    if (ini > fim || ini >= total) { res.setHeader('Content-Range', `bytes */${total}`); return res.status(416).end() }
  }
  try {
    const stream = await openBlob(blob, m && total > 0 ? `bytes=${ini}-${fim}` : undefined);
    // navegador desistiu (trocou de conversa, cancelou o áudio): fecha a conexão com o MinIO na hora —
    // antes ela ficava presa e, com as vagas esgotadas, nenhum arquivo carregava mais
    res.on('close', () => { if (!res.writableFinished) stream.destroy() });
    stream.on('error', () => { if (!res.headersSent) res.status(404); res.end() });
    res.setHeader('Content-Type', blob.contentType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    const inline = /^(image|audio|video)\/|^application\/pdf$/.test(blob.contentType || '');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(blob.filename)}`);
    if (m && total > 0) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${ini}-${fim}/${total}`);
      res.setHeader('Content-Length', String(fim - ini + 1));
    } else {
      res.setHeader('Content-Length', String(total));
    }
    stream.pipe(res);
  } catch {
    if (!res.headersSent) res.status(404).end();
  }
});
