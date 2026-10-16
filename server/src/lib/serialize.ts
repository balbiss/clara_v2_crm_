// `render json: record` do Rails: todas as colunas em snake_case, datas em ISO 8601 com
// milissegundos e decimal como string. O front portado da v1 espera exatamente esse formato.
const snake = (s: string) => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());

export function railsJson<T extends Record<string, unknown>>(row: T, omit: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = snake(k);
    if (omit.includes(key)) continue;
    out[key] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Time#iso8601 do Rails (sem milissegundos, UTC com "Z"). */
export const iso8601 = (d: Date | null | undefined) => (d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : null);

/** strftime('%H:%M') no fuso de São Paulo (o Rails da v1 roda com time_zone de Brasília). */
export function hhmm(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d);
}

export const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
export const presence = <T>(v: T): T | null => (blank(v) ? null : v);
