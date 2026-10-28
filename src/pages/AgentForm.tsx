import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Shuffle } from 'lucide-react'
import api from '../api'
import { agentsStore } from '../store/agents'
import { btn, inputStyle, labelStyle } from '../components/ui'
import { PageHead, Section, Switch, toast, confirmBox } from '../components/ui2'

// Novo / editar agente: dados, perfil de acesso (RBAC), departamento (rodízio) e permissões.
/* eslint-disable @typescript-eslint/no-explicit-any */
const DEPARTMENTS = [
  { value: 'corretor', label: 'Consultora', desc: 'Atende novas revendedoras e a régua de relacionamento' },
  { value: 'suporte', label: 'Suporte', desc: 'Atende dúvidas e problemas' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Cobranças, boletos e contratos' },
  { value: 'manutencao', label: 'Manutenção', desc: 'Reparos e serviços técnicos' },
]
const ROLES = [
  { value: 'consultor', label: 'Consultor', desc: 'Só a própria carteira. Não vê configurações nem outras carteiras.' },
  { value: 'gerente', label: 'Gerente', desc: 'Vê a carteira inteira e reatribui responsáveis. Não mexe em configurações.' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Vê inadimplência/cobrança e a carteira inteira pra cruzar consultores.' },
  { value: 'diretoria', label: 'Diretoria', desc: 'Acesso total, inclusive configurações críticas do sistema.' },
]
const PERMS = [
  { key: 'view_all_contacts', label: 'Ver todos os clientes', desc: 'Se desligado, a pessoa só vê os clientes atribuídos a ela.' },
  { key: 'export_data', label: 'Permitir exportação', desc: 'Pode baixar listas de clientes e relatórios.' },
  { key: 'delete_data', label: 'Apagar registros', desc: 'Pode excluir permanentemente contatos e negociações.' },
  { key: 'broadcast', label: 'Fazer disparos', desc: 'Libera Comunicações › Disparos. Consultora dispara só pra própria carteira e pelos números que atende. Gerência e diretoria já têm.' },
]
const EMPTY = { first_name: '', last_name: '', email: '', phone: '', password: '', role: 'consultor', department: 'corretor', jueri_gerente_id: '', round_robin_group_id: null as number | null, status: 'active', permissions: { view_all_contacts: false, export_data: false, delete_data: false } as Record<string, boolean> }

export default function AgentForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = !!id
  const [form, setForm] = useState<any>(EMPTY)
  const [loading, setLoading] = useState(editing)
  const [showPw, setShowPw] = useState(false)
  const [groups, setGroups] = useState<any[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [retro, setRetro] = useState(false)
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }))

  useEffect(() => {
    api.get('/round_robin_groups').then(({ data }) => setGroups(data)).catch(e => console.error('Erro ao carregar grupos de rodízio', e))
    api.get('/pipelines').then(({ data }) => setFunis(data)).catch(() => {})
    if (!id) return
    api.get(`/agents/${id}`).then(({ data }) => {
      setForm({
        first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '', phone: data.phone || '', password: '',
        role: data.role || 'consultor', department: data.department || 'corretor', jueri_gerente_id: data.jueri_gerente_id || '',
        round_robin_group_id: data.round_robin_group_id || null, status: data.status || 'active',
        permissions: data.permissions && Object.keys(data.permissions).length ? data.permissions : { view_all_contacts: false, export_data: false, delete_data: false },
      })
    }).catch(e => console.error('Erro ao carregar agente:', e)).finally(() => setLoading(false))
  }, [id])

  const genPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*'
    set({ password: Array.from(crypto.getRandomValues(new Uint32Array(12)), n => chars[n % chars.length]).join('') })
    setShowPw(true)
  }
  const assignRetro = async () => {
    if (!(await confirmBox('Atribuir revendedoras existentes?', 'Toda revendedora desse gerente no Jueri que ainda está sem responsável vai ser atribuída a esta pessoa. Quem já tem responsável não é alterado.', 'Sim, atribuir', false))) return
    setRetro(true)
    try { const { data } = await api.post(`/agents/${id}/assign_unassigned_by_gerente`); toast('success', `${data.assigned_count} revendedora(s) atribuída(s).`) }
    catch (e: any) { toast('error', e.response?.data?.message || 'Erro ao atribuir revendedoras existentes.') }
    finally { setRetro(false) }
  }
  const save = async () => {
    try {
      const data = { ...form }
      if (editing && !data.password) delete data.password
      if (editing) await api.put(`/agents/${id}`, { agent: data })
      else await api.post('/agents', { agent: data })
      agentsStore.fetchAgents()
      navigate('/agentes')
    } catch { toast('error', 'Erro ao salvar. Verifique o e-mail (já pode estar em uso) e a senha (mínimo 6 caracteres).') }
  }

  const radioCard = (opts: { value: string; label: string; desc: string }[], value: string, onPick: (v: string) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
      {opts.map(o => (
        <label key={o.value} style={{ display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid ' + (value === o.value ? 'var(--terra)' : 'var(--line)'), background: value === o.value ? 'var(--terraSoft)' : 'var(--card)', borderRadius: 10, cursor: 'pointer' }}>
          <input type="radio" checked={value === o.value} onChange={() => onPick(o.value)} style={{ marginTop: 3 }} />
          <span><b style={{ display: 'block', fontSize: 13.5 }}>{o.label}</b><span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{o.desc}</span></span>
        </label>
      ))}
    </div>
  )
  const field = (label: React.ReactNode, node: React.ReactNode) => <div style={{ marginBottom: 14 }}><span style={labelStyle}>{label}</span>{node}</div>

  if (loading) return <p style={{ color: 'var(--muted)' }}>Carregando dados…</p>
  return (
    <div>
      <button onClick={() => navigate('/agentes')} style={{ ...btn('ghost'), marginBottom: 14, padding: '6px 12px' }}><ArrowLeft size={14} /> Voltar</button>
      <PageHead title={editing ? 'Editar agente' : 'Novo agente'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Section title="Dados do agente">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('Nome', <input value={form.first_name} onChange={e => set({ first_name: e.target.value })} placeholder="Ex.: João" style={inputStyle} />)}
            {field('Sobrenome', <input value={form.last_name} onChange={e => set({ last_name: e.target.value })} placeholder="Ex.: Silva" style={inputStyle} />)}
          </div>
          {field('WhatsApp', <input type="tel" value={form.phone} onChange={e => set({ phone: e.target.value })} placeholder="(11) 99999-9999" style={inputStyle} />)}
          {field('E-mail de login', <input type="email" value={form.email} onChange={e => set({ email: e.target.value })} placeholder="nome@claraferreira.com" style={inputStyle} />)}
          {field(<>Senha de acesso {editing && <span style={{ textTransform: 'none', letterSpacing: 0 }}>(deixe em branco para não alterar)</span>}</>, (
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set({ password: e.target.value })} placeholder="Mínimo 6 caracteres" style={{ ...inputStyle, paddingRight: 76 }} />
              <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
                <button type="button" onClick={() => setShowPw(s => !s)} title="Mostrar/ocultar" style={{ border: 'none', background: 'none', color: 'var(--muted)', padding: 6, display: 'flex' }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                <button type="button" onClick={genPassword} title="Gerar senha aleatória" style={{ border: 'none', background: 'none', color: 'var(--muted)', padding: 6, display: 'flex' }}><Shuffle size={15} /></button>
              </span>
            </div>
          ))}
          {field('Perfil de acesso', radioCard(ROLES, form.role, v => set({ role: v })))}
          {(form.role === 'gerente' || form.role === 'consultor') && field(<>ID do gerente no Jueri (opcional)</>, (
            <>
              <input value={form.jueri_gerente_id} onChange={e => set({ jueri_gerente_id: e.target.value })} placeholder="Ex.: 42 (mais de um: 42, 57)" style={inputStyle} />
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 0' }}>Se preenchido, toda revendedora nova sincronizada do Jueri sob esse gerente já entra atribuída a esta pessoa. Mais de um gerente: separe por vírgula.</p>
              {editing && form.jueri_gerente_id && <button type="button" onClick={assignRetro} disabled={retro} style={btn('soft', { marginTop: 8, fontSize: 12.5 })}>{retro ? 'Aplicando…' : 'Atribuir revendedoras já existentes sem responsável'}</button>}
            </>
          ))}
          {field(<>Departamento <span style={{ textTransform: 'none', letterSpacing: 0 }}>(rodízio de WhatsApp)</span></>, radioCard(DEPARTMENTS, form.department, v => set({ department: v })))}
          {form.department === 'corretor' && groups.length > 0 && field('Grupo de rodízio (opcional)', (
            <select value={form.round_robin_group_id ?? ''} onChange={e => set({ round_robin_group_id: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
              <option value="">Sem grupo (rodízio com todas as consultoras da conta)</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ))}
          {editing && field('Status', (
            <select value={form.status} onChange={e => set({ status: e.target.value })} style={inputStyle}>
              <option value="active">Ativo (acesso liberado)</option><option value="blocked">Bloqueado (acesso negado)</option>
            </select>
          ))}
        </Section>

        {form.role !== 'diretoria' && funis.length > 0 && (
          <Section title="Funis que vê" description="Marque só os funis que essa pessoa usa: os outros somem do menu e da hora de mover o card. Nenhum marcado = vê todos.">
            {funis.map((p: any) => {
              const lista: number[] = Array.isArray(form.permissions.funis) ? (form.permissions.funis as any) : []
              const on = lista.includes(p.id)
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 13.5 }}>
                  <input type="checkbox" checked={on} onChange={() => set({ permissions: { ...form.permissions, funis: (on ? lista.filter(x => x !== p.id) : [...lista, p.id]) as any } })} />
                  {p.system ? `${p.name} (régua das revendedoras)` : p.name}
                </label>
              )
            })}
          </Section>
        )}

        <Section title="Permissões de acesso" description="O que esta pessoa pode ver ou fazer, além do perfil escolhido.">
          {PERMS.map(p => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <Switch on={!!form.permissions[p.key]} onChange={v => set({ permissions: { ...form.permissions, [p.key]: v } })} />
              <span><b style={{ display: 'block', fontSize: 13.5 }}>{p.label}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.desc}</span></span>
            </div>
          ))}
        </Section>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button onClick={() => navigate('/agentes')} style={btn('ghost')}>Cancelar</button>
        <button onClick={save} style={btn('primary')}>{editing ? 'Salvar alterações' : 'Criar agente'}</button>
      </div>
    </div>
  )
}
