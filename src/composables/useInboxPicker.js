import Swal from 'sweetalert2'
import { inboxesStore } from '../store/inboxes'

// Com 2+ caixas de WhatsApp conectadas, sem perguntar o backend sempre
// mandava pela mais antiga da conta, sem nenhum critério de negócio — dono
// achou confuso quando a conta ganhou uma 2ª linha ("Comercial-
// Consultores", 2026-09-25). Usado em todo botão "iniciar conversa"
// (ContactDetails/RevendedorasAtivas/TarefasView/AtacadoView).
/** @returns {Promise<{inboxId: any, cancelled: boolean}>} */
export async function pickWhatsappInbox(confirmText = 'Iniciar conversa') {
  if (!inboxesStore.isLoadedOnce) await inboxesStore.fetchInboxes()

  const todas = inboxesStore.inboxes.filter(i => ['baileys', 'waha'].includes(i.provider))
  // cada número é um WhatsApp separado (Bel, 05/11): abre/manda pelo número de quem está usando —
  // só os números de que a pessoa é membro; com um só, nem pergunta. Sem caixa nenhuma, todas (como antes).
  const minhas = todas.filter(i => i.member)
  const whatsappInboxes = minhas.length ? minhas : todas
  // está dentro de uma caixa (Conversas › Prospecção Thays): manda por ela, sem perguntar
  // ("a msg vai ser enviada pela caixa onde ele estiver" — Bel, 05/11; vídeo 06/11)
  const naCaixa = window.location.pathname.match(/\/conversas\/inbox\/(\d+)/)?.[1]
  const atual = naCaixa && whatsappInboxes.find(i => String(i.id) === naCaixa)
  if (atual) return { inboxId: atual.id, cancelled: false }
  if (whatsappInboxes.length <= 1) {
    return { inboxId: whatsappInboxes[0]?.id ?? null, cancelled: false }
  }

  // cada número com a cor e o apelido da caixa (os mesmos da lista de conversas), nada pré-marcado
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
  const html = '<div style="display:flex;flex-direction:column;gap:8px;text-align:left">' + whatsappInboxes.map(i =>
    `<label style="display:flex;align-items:center;gap:10px;border:2px solid ${esc(i.badge_color)};border-radius:8px;padding:10px 12px;cursor:pointer">` +
    `<input type="radio" name="caixa" value="${esc(i.id)}" style="accent-color:${esc(i.badge_color)}">` +
    `<span style="padding:2px 8px;border-radius:10px;background:${esc(i.badge_color)};color:#fff;font-weight:700;font-size:12px;text-transform:uppercase">${esc(i.badge_short)}</span>` +
    `<span style="font-size:14px">${esc(i.phone_number || 'sem número')}</span></label>`).join('') + '</div>'
  const { value: chosenId, isConfirmed } = await Swal.fire({
    title: 'Enviar por qual número?',
    html,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#c8506a',
    preConfirm: () => {
      const marcado = document.querySelector('input[name="caixa"]:checked')
      if (!marcado) { Swal.showValidationMessage('Escolha o número'); return false }
      return marcado.value
    },
  })

  return { inboxId: isConfirmed ? chosenId : null, cancelled: !isConfirmed }
}
