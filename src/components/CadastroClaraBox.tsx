import { useEffect, useState } from 'react'
import Swal from 'sweetalert2'
import { Copy, ExternalLink, FileText, Send } from 'lucide-react'
import api from '../api'
import { K, kBtn } from '../lib/kommo'

// Painel "Cadastro de revendedora" na conversa: a atendente gera o link do formulário do sistema de
// cadastro (cadastro.clarajoias.com.br) e manda pra cliente. O cadastro fica no nome de quem gerou
// (e-mail/id do CRM). Mostra a situação ao vivo; se outra atendente já tinha o cadastro, avisa.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Props = { contactId: number; contactName?: string | null; onInserir: (texto: string) => void }

const toast = (icon: 'success' | 'error' | 'info', title: string) => Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 3500 })
const COR: Record<string, string> = {
  quiz_aprovado: '#99ccff', formulario_enviado: '#fffeb2', formulario_preenchido: '#ffcc66', pendente_avalista: '#ffc8c8', analise_humana: '#e6e8ff',
  aprovado: '#ccff66', aprovado_avalista: '#87f2c0', documentos_ok: '#99ccff', aguardando_assinatura: '#e7d6ff', inicializacao: '#ffd6a5',
  iniciacao_agendada: '#ffb98a', iniciada: '#a8e6a3', reprovado: '#ff8f92', desistencia: '#d5d8db',
}

export default function CadastroClaraBox({ contactId, contactName, onInserir }: Props) {
  const [d, setD] = useState<any>(null)
  const [gerando, setGerando] = useState(false)
  useEffect(() => {
    setD(null)
    api.get(`/cadastro_clara/contacts/${contactId}`).then(r => setD(r.data)).catch(e => setD({ ligado: true, erro: e.response?.data?.message || 'Não foi possível consultar o cadastro.' }))
  }, [contactId])
  if (!d) return <div style={{ fontSize: 13, color: K.muted, margin: '4px 0 8px' }}>Carregando…</div>
  if (!d.ligado) return (
    <div style={{ fontSize: 13.5, color: K.muted, margin: '4px 0 8px' }}>
      O CRM ainda não está ligado ao sistema de cadastro. A diretoria liga em <b>Configurações › Central de integrações › Cadastro de revendedoras</b>.
    </div>
  )
  const c = d.cadastro
  const primeiro = (contactName || '').trim().split(/\s+/)[0] || ''
  const mensagem = (link: string) => `Oi${primeiro ? ' ' + primeiro : ''}! 😊 Segue o link pra você fazer seu cadastro de revendedora Clara Ferreira: ${link}\nÉ rapidinho, qualquer dúvida me chama aqui.`

  const gerar = async () => {
    setGerando(true)
    try {
      const { data } = await api.post(`/cadastro_clara/contacts/${contactId}/formulario`)
      setD({ ligado: true, cadastro: data.cadastro })
      if (data.aviso) {
        const r = await Swal.fire({ icon: 'warning', title: 'Cadastro de outra atendente', text: data.aviso, showCancelButton: true, confirmButtonText: 'Mandar o link mesmo assim', cancelButtonText: 'Não mandar', confirmButtonColor: '#8e2a46' })
        if (!r.isConfirmed) return
      }
      onInserir(mensagem(data.link))
      toast('success', data.ja_existia ? 'Link do cadastro na mensagem — confira e envie.' : 'Cadastro aberto no seu nome. Link na mensagem — confira e envie.')
    } catch (e: any) {
      toast('error', e.response?.data?.message || 'Não foi possível gerar o formulário.')
    } finally { setGerando(false) }
  }
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 30, gap: 10, fontSize: 14 }}>
      <span style={{ width: '42%', flex: 'none', color: K.muted }}>{rotulo}</span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{valor || '...'}</span>
    </div>
  )
  const pequeno: React.CSSProperties = { height: 30, padding: '0 10px', border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontFamily: K.font, fontSize: 13, color: K.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }

  return (
    <div data-testid="cadastro-clara" style={{ margin: '4px 0 8px' }}>
      {d.erro && <div style={{ fontSize: 13, color: '#b3261e', margin: '4px 0' }}>{d.erro}</div>}
      {!c ? (
        <>
          <p style={{ fontSize: 13.5, color: K.muted, margin: '2px 0 8px' }}>Essa cliente ainda não tem cadastro de revendedora. O link sai no seu nome.</p>
          <button onClick={gerar} disabled={gerando} style={{ ...kBtn('blue'), display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={15} /> {gerando ? 'Gerando…' : 'Gerar formulário de cadastro'}</button>
        </>
      ) : (
        <>
          {linha('Situação', <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, background: COR[c.situacao] || '#e6e8ec', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{c.situacao_nome}</span>)}
          {c.motivo && linha('Motivo', c.motivo)}
          {linha('Cadastro', c.codigo)}
          {linha('Atendente', c.consultora)}
          {c.origem && linha('Origem', c.origem)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {['quiz_aprovado', 'formulario_enviado'].includes(c.status) && (
              <button onClick={gerar} disabled={gerando} style={pequeno} title="Coloca o link na mensagem pra você enviar"><Send size={13} /> {gerando ? '…' : 'Mandar o link'}</button>
            )}
            <button onClick={() => { navigator.clipboard?.writeText(c.link_formulario); toast('success', 'Link do formulário copiado.') }} style={pequeno}><Copy size={13} /> Copiar link</button>
            <a href={c.link_dossie} target="_blank" rel="noreferrer" style={{ ...pequeno, textDecoration: 'none' }}><ExternalLink size={13} /> Abrir no cadastro</a>
          </div>
        </>
      )}
    </div>
  )
}
