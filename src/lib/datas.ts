/** Datas no padrão brasileiro, no fuso de quem está usando o CRM. */

const doisDig = (n: number) => String(n).padStart(2, '0');
const hora = (d: Date) => doisDig(d.getHours()) + ':' + doisDig(d.getMinutes());
const mesmoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "09/10/2026 às 09:37" */
export function dataHoraCompleta(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return doisDig(d.getDate()) + '/' + doisDig(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + hora(d);
}

/** "hoje 09:37" · "ontem 18:02" · "07/10 14:20" · "07/10/2025 14:20" (ano diferente) */
export function dataHoraCurta(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const agora = new Date();
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
  if (mesmoDia(d, agora)) return 'hoje ' + hora(d);
  if (mesmoDia(d, ontem)) return 'ontem ' + hora(d);
  const dia = doisDig(d.getDate()) + '/' + doisDig(d.getMonth() + 1);
  return (d.getFullYear() === agora.getFullYear() ? dia : dia + '/' + d.getFullYear()) + ' ' + hora(d);
}
