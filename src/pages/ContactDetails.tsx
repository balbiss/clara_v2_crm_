import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { useClickOutside } from '../lib/hooks'
import { Activity, AtSign, Ban, CalendarDays, ChevronLeft, Edit2, ExternalLink, Hash, History, IdCard, Info, Layers, MapPin, Merge, MessageCircle, Phone, Plus, ShieldCheck, StickyNote, UserRound, Wallet } from 'lucide-react'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { statusLabel } from '../constants/regua'
import { relativeTimeBR } from '../utils/relativeTime'
import { useContactFields } from '../composables/useContactFields'
import EditContactModal from '../components/EditContactModal'
import { ChatAvatar } from '../components/ChatAvatar'
import { Modal, Tag, btn, inputStyle, labelStyle, serif } from '../components/ui'
import { Badge, toast, confirmBox } from '../components/ui2'
import { brl, contactName, statusTone, useStartConversation } from '../components/lists'
import { nivelInfo } from '../constants/nivel'
import { fmtPhone } from './SettingsInboxDetail'

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
  const tagRef = useClickOutside<HTMLDivElement>(() => setTagOpen(false), tagOpen)
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
  const blocked = contact.status === 'blocked'
  const nv = contact.nivel ? nivelInfo(contact.nivel) : null
  const tabIcon: Record<string, any> = { Notas: StickyNote, Cadastro: IdCard, 'Informações': Info, 'Histórico': History, Mesclar: Merge }
  const fact = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span>
      </span>
    </div>
  )
  const row = (label: string, value: React.ReactNode, k: string) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 40%) 1fr', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span><b style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</b>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link to="/contatos" style={{ color: 'var(--muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={14} /> Contatos</Link>
        <span>/</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{name}</span>
      </div>

      {/* cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: 6, background: 'var(--brand-grad)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '16px 20px' }}>
          <ChatAvatar nome={name} foto={contact.avatar_url} size={64} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ ...serif, fontSize: 25, margin: 0, lineHeight: 1.15 }}>{name}</h1>
              {blocked ? <Badge tone="red">Bloqueado</Badge> : <Badge tone={statusTone(contact.status)}>{statusLabel(contact.status)}</Badge>}
              {nv && <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: nv.color, background: nv.bg }}>{nv.emoji} {nv.nome}</span>}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={12} />{fmtPhone(contact.phone) || 'Sem telefone'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><AtSign size={12} />{contact.email || 'Sem e-mail'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Activity size={12} />Criado {criado} · {ativ ? `última atividade ${ativ}` : 'sem atividade ainda'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
              {(contact.tags || []).map((t: any) => <Tag key={t.id} name={t.name} color={t.color} onRemove={() => removeTag(t.id)} />)}
              <div ref={tagRef} style={{ position: 'relative' }}>
                <button onClick={() => setTagOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, border: '1px dashed var(--line)', background: 'none', color: 'var(--muted)', fontSize: 11.5, fontWeight: 600 }}><Plus size={11} /> etiqueta</button>
                {tagOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 280, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, boxShadow: '0 12px 28px rgba(8,17,31,.14)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input autoFocus value={tagName} onChange={e => setTagName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagOpen(false) }} placeholder="Nova ou existente…" style={{ ...inputStyle, padding: '6px 9px', fontSize: 12.5 }} />
                      <button style={btn('primary', { padding: '6px 10px', fontSize: 12 })} disabled={!tagName.trim()} onClick={() => addTag()}>OK</button>
                    </div>
                    {suggestions.length > 0 && (
                      <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto' }}>
                        {suggestions.map(t => <button key={t.id} onClick={() => addTag(t.name, t.color)} className="hoverable" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: 'none', borderRadius: 6, background: 'none', fontSize: 12.5, textAlign: 'left', color: 'var(--ink)' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color }} />{t.name}</button>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {TAG_COLORS.map(c => <button key={c} onClick={() => setTagColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: tagColor === c ? '2px solid var(--ink)' : '2px solid transparent' }} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
            {jueriUrl && <a href={jueriUrl} target="_blank" rel="noopener" style={{ ...btn('ghost'), textDecoration: 'none' }}><ExternalLink size={13} /> Jueri</a>}
            <button style={btn('ghost', { color: blocked ? undefined : '#B42318' })} disabled={blocking} onClick={toggleBlock}>{blocked ? <><ShieldCheck size={13} /> Desbloquear</> : <><Ban size={13} /> Bloquear</>}</button>
            <button style={btn('primary', { background: '#25D366' })} disabled={busyId === contact.id} onClick={() => start(contact)}><MessageCircle size={14} /> {busyId === contact.id ? 'Abrindo…' : 'Enviar mensagem'}</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 290px) 1fr', gap: 14, alignItems: 'start' }} className="contact-grid">
        {/* resumo */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px 6px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 }}>Resumo</div>
          {fact(<Layers size={14} />, 'Etapa', blocked ? 'Bloqueado' : statusLabel(contact.status))}
          {fact(<UserRound size={14} />, 'Responsável', contact.user_id ? agentName(contact.user_id) : 'Não atribuído')}
          {fact(<MapPin size={14} />, 'Cidade', contact.city || '—')}
          {fact(<Wallet size={14} />, 'Venda do mês', brl(contact.custom_attributes?.venda) || '—')}
          {fact(<CalendarDays size={14} />, 'Próximo agendamento', contact.proximo_agendamento_em ? fmtDT(contact.proximo_agendamento_em) : '—')}
          {fact(<Hash size={14} />, 'ID no Jueri', contact.id_jueri || contact.custom_attributes?.id_jueri || '—')}
          <div style={{ padding: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)' }}>{(contact.notes || []).length} nota{(contact.notes || []).length === 1 ? '' : 's'} · {(contact.conversations || []).length} conversa{(contact.conversations || []).length === 1 ? '' : 's'}</div>
        </div>

        {/* abas */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 2, padding: '0 10px', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
            {TABS.map(t => {
              const Icon = tabIcon[t]
              const on = tab === t
              return <button key={t} onClick={() => setTab(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 12px 10px', border: 'none', background: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: on ? 'var(--terra)' : 'var(--muted)', borderBottom: '2px solid ' + (on ? 'var(--terra)' : 'transparent') }}><Icon size={14} />{t}</button>
            })}
          </div>
          <div style={{ padding: 18 }}>
            {tab === 'Notas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={labelStyle}>Biografia</span>
                    {bio !== (contact.bio || '') && <button style={btn('primary', { padding: '5px 12px', fontSize: 12 })} disabled={savingBio} onClick={saveBio}>{savingBio ? 'Salvando…' : 'Salvar biografia'}</button>}
                  </div>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Particularidades da revendedora: preferências, histórico, coisas pra lembrar no próximo atendimento…" style={{ ...textarea, background: '#FFFBEB', borderColor: '#F5E6B8' }} />
                </div>
                <div>
                  <span style={labelStyle}>Notas</span>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)', overflow: 'hidden' }}>
                    <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} placeholder="Escreva uma nota sobre esta revendedora…" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote() }} style={{ ...textarea, border: 'none', borderRadius: 0, background: 'transparent' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 8px 12px' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl + Enter para salvar</span>
                      <button style={btn('primary', { padding: '6px 12px', fontSize: 12, opacity: newNote.trim() ? 1 : 0.5 })} disabled={!newNote.trim()} onClick={saveNote}><Plus size={13} /> Adicionar nota</button>
                    </div>
                  </div>
                </div>
                {(contact.notes || []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {contact.notes.map((n: any, i: number) => {
                      const author = n.user ? `${n.user.first_name || n.user.name || ''} ${n.user.last_name || ''}`.trim() : 'Usuário'
                      return (
                        <div key={n.id} style={{ display: 'flex', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <ChatAvatar nome={author} size={28} />
                            {i < contact.notes.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--line)', margin: '4px 0' }} />}
                          </div>
                          <button onClick={() => setNote(n)} className="hoverable" style={{ flex: 1, minWidth: 0, textAlign: 'left', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', padding: '8px 12px', marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><b>{author}</b><span style={{ color: 'var(--muted)' }}>{fmtDT(n.created_at)}</span></div>
                            <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.content}</p>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : <p style={{ ...emptyTxt, textAlign: 'center', margin: '6px 0' }}>Nenhuma nota ainda.</p>}
              </div>
            )}

            {tab === 'Cadastro' && (
              <div>
                {dados.length > 0 ? dados.map(f => row(f.label, String(f.value), f.key))
                  : <p style={emptyTxt}>Nenhum dado cadastral disponível ainda. Revendedoras sincronizadas do Jueri recebem esses dados automaticamente — se essa revendedora já existia antes da sincronização, aguarde o próximo ciclo automático.</p>}
                {jueriUrl && <a href={jueriUrl} target="_blank" rel="noopener" style={{ ...btn('ghost'), marginTop: 14, textDecoration: 'none' }}><ExternalLink size={13} /> Editar no Jueri</a>}
              </div>
            )}

            {tab === 'Informações' && (
              <div>
                {infos.length > 0 ? infos.map(f => row(f.label, f.value, f.key))
                  : <p style={emptyTxt}>Nenhum campo personalizado ainda. Use "Adicionar/editar campos" pra criar informações que não existem no Jueri (ex: hobby, preferência de contato).</p>}
                <button style={{ ...btn('ghost'), marginTop: 14 }} onClick={() => setEditOpen(true)}><Edit2 size={13} /> Adicionar/editar campos</button>
              </div>
            )}

            {tab === 'Histórico' && (
              <div style={{ position: 'relative', paddingLeft: 20 }}>
                <span style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--line)' }} />
                {[
                  ...audit.map((e: any) => ({ k: 'a' + e.id, at: e.created_at, color: e.event_type === 'status' ? 'var(--terra)' : '#7c3aed', title: auditLabel(e), sub: `Por: ${auditAuthor(e)}`, action: null as any })),
                  ...(contact.conversations || []).map((cv: any) => ({
                    k: 'c' + cv.id, at: cv.created_at, color: '#25D366', title: `Conversa #${cv.id} — ${cv.status === 'open' ? 'Aberta' : cv.status === 'resolved' ? 'Resolvida' : cv.status}`,
                    sub: cv.messages?.length ? `Última mensagem: "${cv.messages[cv.messages.length - 1].text}"` : '', action: cv.id,
                  })),
                  { k: 'criado', at: contact.created_at, color: 'var(--muted)', title: 'Contato adicionado ao CRM', sub: '', action: null },
                ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).map(ev => (
                  <div key={ev.k} style={{ position: 'relative', paddingBottom: 14 }}>
                    <span style={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', background: 'var(--card)', border: `3px solid ${ev.color}` }} />
                    <small style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 11.5 }}>{fmtDT(ev.at)}</small>
                    <p style={{ margin: '1px 0 0', fontSize: 13, fontWeight: 600 }}>{ev.title}</p>
                    {ev.sub && <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--muted)' }}>{ev.sub}</p>}
                    {ev.action && <button style={btn('soft', { padding: '4px 10px', fontSize: 11.5, marginTop: 5 })} onClick={() => navigate(`/conversas?abrir=${ev.action}`)}>Ir para a conversa</button>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'Mesclar' && (
              <div>
                <p style={{ ...emptyTxt, margin: '0 0 10px' }}>Pesquise o contato que deve ficar. As conversas deste cadastro passam para ele e este cadastro é apagado.</p>
                <input value={mergeQ} onChange={e => setMergeQ(e.target.value)} placeholder="Pesquisar por nome ou telefone…" style={{ ...inputStyle, maxWidth: 360 }} />
                {mergeList.length > 0 && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginTop: 10, maxWidth: 460, overflow: 'hidden' }}>
                    {mergeList.map(c => (
                      <button key={c.id} onClick={() => merge(c)} className="hoverable" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left' }}>
                        <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={28} />
                        <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13 }}>{contactName(c)}</b><small style={{ color: 'var(--muted)' }}>{c.phone || 'Sem telefone'}</small></span>
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
