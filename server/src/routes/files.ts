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
  try {
    const stream = await openBlob(blob);
    res.setHeader('Content-Type', blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(blob.byteSize));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    const inline = /^(image|audio|video)\/|^application\/pdf$/.test(blob.contentType || '');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(blob.filename)}`);
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});
