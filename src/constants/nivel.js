// Nível da revendedora, sincronizado do Jueri (level_revendedor) — "estrelas"
// que sobem conforme ela vende mais. Vem como "1 - Safira", "2 - Rubi" etc
// (índice numérico + nome), ou só o nome pros níveis sem índice (Consignado,
// Pré-consignado, Diamante).
export const NIVEL_META = {
  'Diamante':       { emoji: '💎', color: '#0ea5e9', bg: '#e0f2fe' },
  'Esmeralda':      { emoji: '💚', color: '#059669', bg: '#d1fae5' },
  'Rubi':           { emoji: '❤️', color: '#dc2626', bg: '#fee2e2' },
  'Safira':         { emoji: '🔷', color: '#2563eb', bg: '#dbeafe' },
  'Consignado':     { emoji: '⭐', color: '#6b7280', bg: '#f3f4f6' },
  'Pré-consignado': { emoji: '🌱', color: '#a16207', bg: '#fef3c7' },
}

// "1 - Safira" -> "Safira"
export const nivelLimpo = (raw) => (raw || '').replace(/^\d+\s*-\s*/, '').trim()

export const nivelInfo = (raw) => {
  const nome = nivelLimpo(raw)
  return { nome, ...(NIVEL_META[nome] || { emoji: '•', color: '#6b7280', bg: '#f3f4f6' }) }
}
