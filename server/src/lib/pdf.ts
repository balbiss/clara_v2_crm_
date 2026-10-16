import { extractText, getDocumentProxy } from 'unpdf';

/** Texto de todas as páginas (equivalente ao PDF::Reader da v1). */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n\n');
}
