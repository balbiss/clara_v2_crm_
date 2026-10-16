import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { Activity, AtSign, Edit2, ExternalLink, Phone, Plus } from 'lucide-react'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { statusLabel } from '../constants/regua'
import { relativeTimeBR } from '../utils/relativeTime'
import { useContactFields } from '../composables/useContactFields'
import EditContactModal from '../components/EditContactModal'
import { ChatAvatar } from '../components/ChatAvatar'
import { Modal, Tag, btn, inputStyle, serif } from '../components/ui'
import { toast, confirmBox } from '../components/ui2'
import { contactName, fmtDate, useStartConversation } from '../components/lists'

// Detalhe do contato: Notas/Biografia (principal), Cadastro (Jueri, só leitura), Informações (campos livres),
// Histórico (auditoria + conversas) e Mesclar.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS = ['Notas', 'Cadastro', 'Informações', 'Histórico', 'Mesclar']
const TAG_COLORS = ['#6b7280', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

const DADOS: { key: string; label: string; source: 'contact' | 'attr'; date?: boolean }[] = [
  { key: 'cpf', label: 'CPF', source: 'contact' },
  { key: 'birth_date', label: 'Data de Nascimento', source: 'contact', date: true },
  { key: 'nivel', label: 'Nível', source: 'contact' },
  { key: 'instagram', label: 'Instagram', source: 'attr' },
  { key: 'id_jueri', label: 'ID Jueri (ERP)', source: 'attr' },
  { key: 'origem', label: 'Origem do lead', source: 'attr' },
  { key: 'gerente_jueri_nome', label: 'Gerente no Jueri', source: 'attr' },
  { key: 'gerente_jueri_id', label: 'ID do Gerente no Jueri', source: 'attr' },
  { key: 'supervisor_nome', label: 'Supervisor no Jueri', source: 'attr' },
  { key: 'rg', label: 'RG', source: 'attr' },
  { key: 'profissao', label: 'Profissão', source: 'attr' },
  { key: 'razao_social', label: 'Razão Social', source: 'attr' },
  { key: 'nome_fantasia', label: 'Nome Fantasia', source: 'attr' },
  { key: 'cnpj', label: 'CNPJ', source: 'attr' },
  { key: 'meta', label: 'Meta Mensal', source: 'attr' },
  { key: 'observacao_jueri', label: 'Observação (Jueri)', source: 'attr' },
  { key: 'observacao_interna_jueri', label: 'Observação Interna (Jueri)', source: 'attr' },
  { key: 'data_inativacao_jueri', label: 'Data de Inativação (Jueri)', source: 'attr', date: true },
]
const RESERVED = [
  'venda', 'proximo_agendamento', 'limite_inicial', 'dia_fechamento', 'data_agendamento', 'obs_fechamento', 'dia_pf_fechamento', 'horario_fechamento',
  'atraso', 'observacao_mes', 'meta', 'desafio_combinado', 'como_chegar_meta', 'instagram', 'id_jueri', 'origem', 'gerente_jueri_id', 'gerente_jueri_nome',
  'supervisor_nome', 'rg', 'profissao', 'razao_social', 'nome_fantasia', 'cnpj', 'observacao_jueri', 'observacao_interna_jueri', 'data_inativacao_jueri',
  'local_trabalho', 'website_jueri', 'referencia_nome', 'referencia_telefone', 'status_cadastral_jueri', 'data_criacao_jueri', 'data_ultima_alteracao_jueri',
  'pedidos', 'telefones_adicionais',
]
const fmtDT = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` }
const textarea: React.CSSProperties = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit', display: 'block' }
const emptyTxt: React.CSSProperties = { color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }

export default function ContactDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const convs = useSnapshot(conversationsStore) as any
  const { start, busyId } = useStartConversation()
  const { labelOf } = useContactFields()
  const [contact, setContact] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Notas')
  const [editOpen, setEditOpen] = useState(false)
  const [bio, setBio] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [note, setNote] = useState<any>(null)
  const [blocking, setBlocking] = useState(false)
  const [allTags, setAllTags] = useState<any[]>([])
  const [tagOpen, setTagOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState(TAG_COLORS[0])
  const [mergeQ, setMergeQ] = useState('')
  const [mergeList, setMergeList] = useState<any[]>([])

  const fetchContact = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/contacts/${id}`)
      setContact(data); setBio(data.bio || '')
    } catch {
      toast('error', 'Contato não encontrado.'); navigate('/contatos')
    } finally { setLoading(false) }
  }
  const fetchTags = () => api.get('/tags').then(({ data }) => setAllTags(data)).catch(() => {})

  useEffect(() => {
    fetchContact(); fetchTags()
    if (!conversationsStore.agents.length) conversationsStore.fetchAgents()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const agentName = (aid: any) => {
    if (!aid) return 'Ninguém'
    const a = convs.agents.find((x: any) => String(x.id) === String(aid))
    return a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : `Usuário #${aid}`
  }
  const audit = useMemo(() => [...(contact?.contact_audit_events || [])].sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)), [contact])
  const auditLabel = (e: any) => e.event_type === 'status'
    ? `Status alterado de "${e.from_value ? statusLabel(e.from_value) : 'Nenhum'}" para "${e.to_value ? statusLabel(e.to_value) : 'Nenhum'}"`
    : `Responsável alterado de "${agentName(e.from_value)}" para "${agentName(e.to_value)}"`
  const auditAuthor = (e: any) => e.changed_by ? `${e.changed_by.first_name || ''} ${e.changed_by.last_name || ''}`.trim() : 'Sistema (sincronização automática)'

  const dado = (f: (typeof DADOS)[number]) => {
    const raw = f.source === 'attr' ? contact?.custom_attributes?.[f.key] : contact?.[f.key]
    if (!raw) return null
    if (!f.date) return raw
    const d = new Date(String(raw).includes('T') ? raw : `${raw}T00:00:00`)
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('pt-BR')
  }
  const dados = contact ? DADOS.map(f => ({ ...f, value: dado(f) })).filter(f => f.value) : []
  const infos = contact ? Object.entries(contact.custom_attributes || {}).filter(([k, v]) => !RESERVED.includes(k) && v).map(([k, v]) => ({ key: k, label: labelOf(k), value: String(v) })) : []
  const jueriUrl = contact?.id_jueri ? `https://claraferreira.jueri.com.br/sis/cadastro/revendedor/${contact.id_jueri}` : null

  const saveBio = async () => {
    setSavingBio(true)
    try { await api.put(`/contacts/${contact.id}`, { contact: { bio } }); setContact({ ...contact, bio }); toast('success', 'Biografia salva!') }
    catch { toast('error', 'Erro ao salvar biografia.') } finally { setSavingBio(false) }
  }
  const saveNote = async () => {
    if (!newNote.trim()) return
    try {
      const { data } = await api.post(`/contacts/${contact.id}/add_note`, { content: newNote })
      setContact({ ...contact, notes: [data, ...(contact.notes || [])] }); setNewNote(''); toast('success', 'Nota salva!')
    } catch { toast('error', 'Erro ao salvar nota.') }
  }
  const toggleBlock = async () => {
    const bloqueando = contact.status !== 'blocked'
    if (!(await confirmBox(bloqueando ? 'Bloquear contato?' : 'Desbloquear contato?', bloqueando ? 'Mensagens desse contato vão parar de gerar resposta automática.' : 'O contato volta a poder ser atendido normalmente.', bloqueando ? 'Sim, bloquear' : 'Sim, desbloquear', bloqueando))) return
    setBlocking(true)
    try { await api.patch(`/contacts/${contact.id}/${bloqueando ? 'block' : 'unblock'}`); setContact({ ...contact, status: bloqueando ? 'blocked' : 'active' }) }
    catch { toast('error', 'Não foi possível atualizar o bloqueio.') } finally { setBlocking(false) }
  }
  const addTag = async (name = tagName, color = tagColor) => {
    name = name.trim()
    if (!name) return
    try {
      const { data } = await api.post(`/contacts/${contact.id}/tags`, { name, color })
      if (!(contact.tags || []).some((t: any) => t.id === data.id)) setContact({ ...contact, tags: [...(contact.tags || []), data] })
      setTagName(''); setTagColor(TAG_COLORS[0]); setTagOpen(false); fetchTags()
    } catch (e: any) { toast('error', e.response?.data?.message || 'Erro ao adicionar etiqueta.') }
  }
  const removeTag = async (tid: number) => {
    try { await api.delete(`/contacts/${contact.id}/tags/${tid}`); setContact({ ...contact, tags: contact.tags.filter((t: any) => t.id !== tid) }) }
    catch { toast('error', 'Erro ao remover etiqueta.') }
  }
  const suggestions = allTags.filter(t => !(contact?.tags || []).some((x: any) => x.id === t.id) && (!tagName.trim() || t.name.toLowerCase().includes(tagName.trim().toLowerCase())))

  // Mesclar: busca em /contacts e move as conversas deste contato pro escolhido (o contato atual é apagado).
  useEffect(() => {
    if (tab !== 'Mesclar' || mergeQ.trim().length < 2) { setMergeList([]); return }
    const t = setTimeout(() => {
      api.get('/contacts', { params: { q: mergeQ } }).then(({ data }) => {
        const rows = Array.isArray(data) ? data : data.contacts || data.payload || []
        const s = mergeQ.toLowerCase()
        setMergeList(rows.filter((c: any) => c.id !== contact?.id && (contactName(c).toLowerCase().includes(s) || (c.phone || '').includes(s))).slice(0, 8))
      }).catch(() => setMergeList([]))
    }, 300)
    return () => clearTimeout(t)
  }, [mergeQ, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const merge = async (target: any) => {
    if (!(await confirmBox('Mesclar contatos?', `As conversas de "${contactName(contact)}" vão para "${contactName(target)}" e este cadastro será apagado. Não dá para desfazer.`, 'Sim, mesclar'))) return
    try { await api.post(`/contacts/${contact.id}/merge`, { target_contact_id: target.id }); toast('success', 'Contatos mesclados.'); navigate(`/contatos/${target.id}`) }
    catch (e: any) { toast('error', e.response?.data?.error || 'Erro ao mesclar contatos.') }
  }

  if (!contact) return <p style={{ ...emptyTxt, padding: 40, textAlign: 'center' }}>{loading ? 'Carregando…' : ''}</p>
  const name = contactName(contact)
  const criado = relativeTimeBR(contact.created_at) || 'data desconhecida'
  const ativ = relativeTimeBR(contact.ultima_interacao_em)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: 'var(--muted)' }}><Link to="/contatos" style={{ color: 'var(--terra)', fontWeight: 600 }}>Contatos</Link> &gt; <b style={{ color: 'var(--ink)' }}>{name}</b></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('ghost')} disabled={blocking} onClick={toggleBlock}>{contact.status === 'blocked' ? 'Desbloquear contato' : 'Bloquear contato'}</button>
          <button style={btn('primary')} disabled={busyId === contact.id} onClick={() => start(contact)}>{busyId === contact.id ? 'Abrindo…' : 'Enviar mensagem'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,320px) 1fr', gap: 18, alignItems: 'start' }} className="contact-grid">
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 22, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><ChatAvatar nome={name} foto={contact.avatar_url} size={84} /></div>
          <h2 style={{ ...serif, fontSize: 24, margin: '12px 0 10px' }}>{name}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Phone size={13} />{(contact.phone || '').replace(/^\+?55/, '').trim() || 'Sem telefone'}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AtSign size={13} />{contact.email || 'Sem e-mail'}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Activity size={13} />{ativ ? `Criado ${criado} • Última atividade ${ativ}` : `Criado ${criado} • Sem atividade ainda`}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
            {(contact.tags || []).map((t: any) => <Tag key={t.id} name={t.name} color={t.color} onRemove={() => removeTag(t.id)} />)}
            {!tagOpen && <button onClick={() => setTagOpen(true)} style={{ ...btn('ghost'), padding: '2px 10px', fontSize: 11.5, borderRadius: 20 }}><Plus size={11} /> etiqueta</button>}
          </div>
          {tagOpen && (
            <div style={{ marginTop: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input autoFocus value={tagName} onChange={e => setTagName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagOpen(false) }} placeholder="Nova etiqueta ou escolha…" style={inputStyle} />
                <button style={btn('primary')} disabled={!tagName.trim()} onClick={() => addTag()}>OK</button>
              </div>
              {suggestions.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {suggestions.map(t => <button key={t.id} onClick={() => addTag(t.name, t.color)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: 'none', background: 'var(--card)', fontSize: 13, textAlign: 'left' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color }} />{t.name}</button>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {TAG_COLORS.map(c => <button key={c} onClick={() => setTagColor(c)} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: tagColor === c ? '2px solid var(--ink)' : '2px solid transparent' }} />)}
              </div>
            </div>
          )}
          {jueriUrl && <a href={jueriUrl} target="_blank" rel="noopener" style={{ ...btn('ghost'), marginTop: 18, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ExternalLink size={13} /> Abrir cadastro no Jueri</a>}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
            {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '13px 18px', border: 'none', background: 'none', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: tab === t ? 'var(--terra)' : 'var(--muted)', borderBottom: '2px solid ' + (tab === t ? 'var(--terra)' : 'transparent') }}>{t}</button>)}
          </div>
          <div style={{ padding: 22 }}>
            {tab === 'Notas' && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Biografia</h4>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Particularidades da revendedora: preferências, histórico, coisas pra lembrar no próximo atendimento…" style={textarea} />
                <button style={{ ...btn('primary'), marginTop: 10 }} disabled={savingBio || bio === (contact.bio || '')} onClick={saveBio}>{savingBio ? 'Salvando…' : 'Salvar biografia'}</button>
                <div style={{ marginTop: 26 }}>
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3} placeholder="Adicione uma nota sobre este contato…" style={textarea} />
                  <button style={{ ...btn('primary'), marginTop: 10 }} disabled={!newNote.trim()} onClick={saveNote}>Salvar nota</button>
                </div>
                {(contact.notes || []).length > 0 ? (
                  <div style={{ marginTop: 22, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                    {contact.notes.map((n: any) => (
                      <button key={n.id} onClick={() => setNote(n)} className="hoverable" style={{ width: '100%', display: 'flex', gap: 10, justifyContent: 'space-between', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left', fontSize: 13 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{n.user ? n.user.first_name || n.user.name : 'Usuário'}</b> <span style={{ color: 'var(--muted)' }}>- {n.content}</span></span>
                        <span style={{ color: 'var(--muted)', flex: 'none', fontSize: 12 }}>{fmtDate(n.created_at)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p style={{ ...emptyTxt, marginTop: 18 }}>Nenhuma nota encontrada.</p>}
              </div>
            )}

            {tab === 'Cadastro' && (
              <div>
                {dados.length > 0
                  ? dados.map(f => <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}><span style={{ color: 'var(--muted)' }}>{f.label}</span><b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{String(f.value)}</b></div>)
                  : <p style={emptyTxt}>Nenhum dado cadastral disponível ainda. Revendedoras sincronizadas do Jueri recebem esses dados automaticamente — se essa revendedora já existia antes da sincronização, aguarde o próximo ciclo automático.</p>}
                {jueriUrl && <a href={jueriUrl} target="_blank" rel="noopener" style={{ ...btn('ghost'), marginTop: 16, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ExternalLink size={13} /> Editar no Jueri</a>}
              </div>
            )}

            {tab === 'Informações' && (
              <div>
                {infos.length > 0
                  ? infos.map(f => <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}><span style={{ color: 'var(--muted)' }}>{f.label}</span><b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{f.value}</b></div>)
                  : <p style={emptyTxt}>Nenhum campo personalizado ainda. Use "Adicionar/editar campos" pra criar informações que não existem no Jueri (ex: hobby, preferência de contato).</p>}
                <button style={{ ...btn('ghost'), marginTop: 16, display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={() => setEditOpen(true)}><Edit2 size={13} /> Adicionar/editar campos</button>
              </div>
            )}

            {tab === 'Histórico' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><small style={{ color: 'var(--muted)', fontWeight: 700 }}>Data de criação</small><p style={{ margin: '2px 0 0' }}>Contato adicionado ao CRM.</p></div>
                {audit.map((e: any) => <div key={e.id}><small style={{ color: 'var(--muted)', fontWeight: 700 }}>{fmtDT(e.created_at)}</small><p style={{ margin: '2px 0 0' }}>{auditLabel(e)}</p><small style={{ color: 'var(--muted)' }}>Por: {auditAuthor(e)}</small></div>)}
                {(contact.conversations || []).length > 0
                  ? contact.conversations.map((cv: any) => (
                    <div key={cv.id}>
                      <small style={{ color: 'var(--muted)', fontWeight: 700 }}>Conversa #{cv.id} - {new Date(cv.created_at).toLocaleDateString('pt-BR')}</small>
                      <p style={{ margin: '2px 0 0' }}>Status: {cv.status === 'open' ? 'Aberta' : cv.status === 'resolved' ? 'Resolvida' : cv.status}</p>
                      {cv.messages?.length > 0 && <p style={{ margin: '2px 0 0' }}>Última mensagem: "{cv.messages[cv.messages.length - 1].text}"</p>}
                      <button style={{ ...btn('ghost'), marginTop: 6, fontSize: 12 }} onClick={() => navigate(`/conversas?abrir=${cv.id}`)}>Ir para a conversa</button>
                    </div>
                  ))
                  : <p style={emptyTxt}>Nenhuma conversa registrada.</p>}
              </div>
            )}

            {tab === 'Mesclar' && (
              <div>
                <p style={emptyTxt}>Pesquise o contato que deve ficar. As conversas deste cadastro passam para ele e este cadastro é apagado.</p>
                <input value={mergeQ} onChange={e => setMergeQ(e.target.value)} placeholder="Pesquisar por nome ou telefone…" style={{ ...inputStyle, maxWidth: 340, marginTop: 10 }} />
                {mergeList.length > 0 && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginTop: 12, maxWidth: 440, overflow: 'hidden' }}>
                    {mergeList.map(c => (
                      <button key={c.id} onClick={() => merge(c)} className="hoverable" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left' }}>
                        <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={28} />
                        <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13.5 }}>{contactName(c)}</b><small style={{ color: 'var(--muted)' }}>{c.phone || 'Sem telefone'}</small></span>
                        <small style={{ color: 'var(--terra)', fontWeight: 700 }}>Mesclar</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <EditContactModal isOpen={editOpen} contact={contact} onClose={() => { setEditOpen(false); fetchContact() }} />
      {note && (
        <Modal title="Detalhes da nota" onClose={() => setNote(null)}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' }}>Criado por <b>{note.user ? note.user.first_name || note.user.name : 'Usuário'}</b> em {fmtDT(note.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.55 }}>{note.content}</p>
        </Modal>
      )}
    </div>
  )
}
