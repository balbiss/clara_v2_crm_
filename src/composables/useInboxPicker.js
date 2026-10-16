import Swal from 'sweetalert2'
import { inboxesStore } from '../store/inboxes'

// Com 2+ caixas de WhatsApp conectadas, sem perguntar o backend sempre
// mandava pela mais antiga da conta, sem nenhum critério de negócio — dono
// achou confuso quando a conta ganhou uma 2ª linha ("Comercial-
// Consultores", 2026-09-25). Usado em todo botão "iniciar conversa"
// (ContactDetails/RevendedorasAtivas/TarefasView/AtacadoView).
/** @returns {Promise<{inboxId: any, cancelled: boolean}>} */
export async function pickWhatsappInbox() {
  if (!inboxesStore.isLoadedOnce) await inboxesStore.fetchInboxes()

  const whatsappInboxes = inboxesStore.inboxes.filter(i => ['baileys', 'waha'].includes(i.provider))
  if (whatsappInboxes.length <= 1) {
    return { inboxId: null, cancelled: false }
  }

  const inputOptions = Object.fromEntries(whatsappInboxes.map(i => [i.id, `${i.name} (${i.phone_number || 'sem número'})`]))
  const { value: chosenId, isConfirmed } = await Swal.fire({
    title: 'Enviar por qual caixa?',
    input: 'select',
    inputOptions,
    inputPlaceholder: 'Escolha a caixa de WhatsApp',
    showCancelButton: true,
    confirmButtonText: 'Iniciar conversa',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#123C87'
  })

  return { inboxId: isConfirmed ? chosenId : null, cancelled: !isConfirmed }
}
