import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activeStorageAttachments, activeStorageBlobs } from '../db/schema.js';

// Anexos no MESMO formato do ActiveStorage da v1 (tabelas active_storage_blobs/attachments,
// objeto no MinIO com a chave do blob). Assim os arquivos já enviados na v1 continuam
// abrindo depois da migração, sem copiar nem renomear nada. Bucket é privado: o arquivo é
// servido pela própria API (proxy), igual ao rails_storage_proxy_url da v1.
const bucket = process.env.MINIO_BUCKET || 'clara-crm';
const SERVICE_NAME = 'minio';

export const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:59040',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || '',
  },
});

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log('MinIO: bucket "' + bucket + '" criado (privado)');
  }
}

/** SecureRandom.base36(28) do Rails — formato das chaves de blob da v1. */
function blobKey(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(28);
  return Array.from(bytes, b => chars[b % 36]).join('');
}

export type Blob = typeof activeStorageBlobs.$inferSelect;

/** has_one_attached / has_many_attached: grava o arquivo e liga ao registro. */
export async function attach(recordType: string, recordId: number, name: string,
  body: Buffer, filename: string, contentType: string): Promise<Blob> {
  const key = blobKey();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  const [blob] = await db.insert(activeStorageBlobs).values({
    key, filename, contentType, byteSize: body.length, serviceName: SERVICE_NAME,
    checksum: crypto.createHash('md5').update(body).digest('base64'),
    metadata: JSON.stringify({ identified: true, analyzed: true }),
  }).returning();
  await db.insert(activeStorageAttachments).values({ name, recordType, recordId, blobId: blob.id });
  return blob;
}

/** Remove todos os anexos `name` de um registro (has_one_attached: trocar = apagar o antigo). */
export async function purge(recordType: string, recordId: number, name: string) {
  const atts = await db.select().from(activeStorageAttachments).where(and(
    eq(activeStorageAttachments.recordType, recordType),
    eq(activeStorageAttachments.recordId, recordId),
    eq(activeStorageAttachments.name, name)));
  if (!atts.length) return;
  const blobs = await db.select().from(activeStorageBlobs).where(inArray(activeStorageBlobs.id, atts.map(a => a.blobId)));
  await db.delete(activeStorageAttachments).where(inArray(activeStorageAttachments.id, atts.map(a => a.id)));
  for (const b of blobs) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: b.key })).catch(() => {});
    await db.delete(activeStorageBlobs).where(eq(activeStorageBlobs.id, b.id));
  }
}

/** Anexos de vários registros de uma vez (evita N+1 ao serializar listas de mensagens). */
export async function blobsFor(recordType: string, recordIds: number[], name: string): Promise<Map<number, Blob[]>> {
  const out = new Map<number, Blob[]>();
  if (!recordIds.length) return out;
  const rows = await db.select({ recordId: activeStorageAttachments.recordId, blob: activeStorageBlobs })
    .from(activeStorageAttachments)
    .innerJoin(activeStorageBlobs, eq(activeStorageBlobs.id, activeStorageAttachments.blobId))
    .where(and(eq(activeStorageAttachments.recordType, recordType),
      inArray(activeStorageAttachments.recordId, recordIds),
      eq(activeStorageAttachments.name, name)));
  for (const r of rows) {
    const list = out.get(r.recordId) ?? [];
    list.push(r.blob);
    out.set(r.recordId, list);
  }
  return out;
}

export async function blobFor(recordType: string, recordId: number, name: string): Promise<Blob | null> {
  return (await blobsFor(recordType, [recordId], name)).get(recordId)?.[0] ?? null;
}

function sign(id: number): string {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update('blob:' + id).digest('base64url').slice(0, 22);
}

/** URL pública (assinada, sem expiração — igual ao proxy do Rails) servida por GET /files/... */
export function blobUrl(blob: Blob): string {
  const base = (process.env.PUBLIC_URL || 'http://localhost:3011').replace(/\/$/, '');
  return `${base}/files/${blob.id}/${sign(blob.id)}/${encodeURIComponent(blob.filename)}`;
}

export function verifyBlobSignature(id: number, sig: string): boolean {
  const expected = sign(id);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function openBlob(blob: Blob): Promise<Readable> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: blob.key }));
  return obj.Body as Readable;
}

export async function downloadBlob(blob: Blob): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await openBlob(blob)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
