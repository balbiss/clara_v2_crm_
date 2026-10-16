// Foto tirada no celular costuma ter 4-10MB (ou vir em formato que o
// WhatsApp não aceita como imagem, tipo HEIC do iPhone ou PNG enorme de
// print) — Bel não conseguia mandar foto pelo CRM (2026-10-06). Redimensiona
// pra no máximo 2048px e converte pra JPEG antes de enviar. Se o navegador
// não conseguir abrir a imagem (ex: HEIC no Chrome do Windows), devolve o
// arquivo original e o backend manda como documento.
const MAX_LADO = 2048
const LIMITE_SEM_MEXER = 1.5 * 1024 * 1024
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp']

/** @param {any} file @returns {Promise<any>} */
export async function prepareImage(file) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file
  if (TIPOS_OK.includes(file.type) && file.size <= LIMITE_SEM_MEXER) return file

  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // PNG com fundo transparente não fica preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    const nome = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch (e) {
    console.warn('Não foi possível otimizar a imagem, enviando original:', e)
    return file
  }
}
