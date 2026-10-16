import { useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import { Users2, UserCircle2, Plus, UserPlus, Check } from 'lucide-react'
import api from '../../api'
import { agentsStore } from '../../store/agents'
import { Modal, btn } from '../../components/ui'
import { PageHead, toast } from '../../components/ui2'
import { ChatAvatar } from '../../components/ChatAvatar'

// Times de vendas do Jueri: quem vê a carteira inteira (Gerenciar acesso) e quem atende de fato
// (Atribuir carteira — só preenche quem ainda está sem responsável).
/* eslint-disable @typescript-eslint/no-explicit-any */
const ROLE_LABELS: Record<string, string> = { consultor: 'Consultor', gerente: 'Gerente', diretoria: 'Diretoria', financeiro: 'Financeiro' }
const isNamedTeam = (n: string) => /^(vendas\s*\d*|g[eê]r[eê]nci?a?\s*comercial|gerente\s*de\s*opera[çc][õo]es)$/i.test(n.trim())

function AgentPick({ agents, checked, onToggle, radio }: { agents: readonly any[]; checked: (id: number) => boolean; onToggle: (id: number) => void; radio?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
      {agents.map(a => {
        const on = checked(a.id)
        return (
          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--line)', background: on ? 'var(--terraSoft)' : 'var(--card)', cursor: 'pointer' }}>
            <input type={radio ? 'radio' : 'checkbox'} checked={on} onChange={() => onToggle(a.id)} />
            <ChatAvatar nome={`${a.first_name} ${a.last_name}`} foto={a.avatar_url} size={30} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{a.first_name} {a.last_name}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{ROLE_LABELS[a.role] || a.role}</span>
            </span>
            {on && <Check size={15} color="var(--terra)" />}
          </label>
        )
      })}
    </div>
  )
}

export default function SalesTeams() {
  const agents = useSnapshot(agentsStore) as any
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState<{ team: any; ids: number[] } | null>(null)
  const [assign, setAssign] = useState<{ team: any; userId: number | null } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/sales_teams').then(({ data }) => setTeams(data)).catch(e => console.error('Erro ao buscar times de vendas:', e)).finally(() => setLoading(false))
    if (!agentsStore.isLoadedOnce) agentsStore.fetchAgents()
  }, [])

  const replaceTeam = (t: any) => setTeams(ts => ts.map(x => (x.id === t.id ? t : x)))

  const saveAccess = async () => {
    if (!access) return
    setBusy(true)
    try { replaceTeam((await api.patch(`/sales_teams/${access.team.id}/members`, { user_ids: access.ids })).data); setAccess(null) }
    catch { toast('error', 'Erro ao salvar acesso do time.') }
    finally { setBusy(false) }
  }
  const confirmAssign = async () => {
    if (!assign?.userId) return
    setBusy(true)
    try {
      const { data } = await api.post(`/sales_teams/${assign.team.id}/assign_unassigned`, { user_id: assign.userId })
      replaceTeam(data.team)
      setAssign(null)
      toast('success', `${data.assigned_count} revendedora(s) atribuída(s)!`)
    } catch { toast('error', 'Erro ao atribuir carteira.') }
    finally { setBusy(false) }
  }

  const teamIcon = (t: any) => (
    <span style={{ width: 40, height: 40, borderRadius: 10, background: isNamedTeam(t.nome) ? 'var(--terraSoft)' : 'var(--oliveSoft)', color: isNamedTeam(t.nome) ? 'var(--terra)' : 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {isNamedTeam(t.nome) ? <Users2 size={19} /> : <UserCircle2 size={19} />}
    </span>
  )

  return (
    <div>
      <PageHead title="Times de vendas" subtitle={<>Times sincronizados do Jueri. <b>Gerenciar acesso</b>: várias pessoas veem a carteira inteira do time (ex.: gerente supervisionando). <b>Atribuir carteira</b>: define quem é o responsável individual das revendedoras que chegaram sem ninguém.</>} />
      {loading ? <p style={{ color: 'var(--muted)' }}>Carregando…</p> : teams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          <Users2 size={34} /><p style={{ margin: '10px 0 2px' }}>Nenhum time encontrado ainda.</p><span style={{ fontSize: 12.5 }}>Aparece sozinho depois da próxima sincronização com o Jueri.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {teams.map(t => (
            <div key={t.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {teamIcon(t)}
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 15.5 }}>{t.nome}</h3>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.contacts_count} {t.contacts_count === 1 ? 'revendedora' : 'revendedoras'} · {t.users.length} {t.users.length === 1 ? 'pessoa com acesso' : 'pessoas com acesso'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minHeight: 30 }}>
                {t.users.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ninguém com acesso ainda</span>
                  : t.users.map((u: any, i: number) => <span key={u.id} title={`${u.name} · ${ROLE_LABELS[u.role] || u.role}`} style={{ marginLeft: i ? -8 : 0, border: '2px solid var(--card)', borderRadius: '50%', display: 'flex' }}><ChatAvatar nome={u.name} foto={u.avatar_url} size={28} /></span>)}
              </div>
              {t.responsaveis_individuais?.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span>Atende hoje:</span>
                  {t.responsaveis_individuais.map((r: any) => <span key={r.id} style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 600 }}>{r.name} ({r.count})</span>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <button onClick={() => setAccess({ team: t, ids: t.users.map((u: any) => u.id) })} style={btn('ghost', { flex: '1 1 auto', fontSize: 12.5 })}><Plus size={14} /> Gerenciar acesso</button>
                <button disabled={!t.unassigned_contacts_count} onClick={() => setAssign({ team: t, userId: null })}
                  title={t.unassigned_contacts_count ? `${t.unassigned_contacts_count} revendedora(s) sem responsável` : 'Nenhuma revendedora sem responsável'}
                  style={btn(t.unassigned_contacts_count ? 'soft' : 'ghost', { flex: '1 1 auto', fontSize: 12.5, opacity: t.unassigned_contacts_count ? 1 : 0.55 })}>
                  <UserPlus size={14} /> {t.unassigned_contacts_count ? `Atribuir carteira (${t.unassigned_contacts_count})` : 'Carteira atribuída'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {access && (
        <Modal title={access.team.nome} subtitle="Marque quem pode ver todas as revendedoras deste time, além do responsável direto de cada uma." onClose={() => setAccess(null)}
          footer={<><button onClick={() => setAccess(null)} style={btn('ghost')}>Cancelar</button><button onClick={saveAccess} disabled={busy} style={btn('primary')}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
          <AgentPick agents={agents.agents} checked={id => access.ids.includes(id)} onToggle={id => setAccess({ ...access, ids: access.ids.includes(id) ? access.ids.filter(x => x !== id) : [...access.ids, id] })} />
        </Modal>
      )}
      {assign && (
        <Modal title={`Atribuir carteira — ${assign.team.nome}`} onClose={() => setAssign(null)}
          subtitle={`${assign.team.unassigned_contacts_count} revendedora(s) deste time ainda não têm responsável. Escolha o consultor: elas passam a aparecer na carteira dele. Quem já tem responsável não é alterado.`}
          footer={<><button onClick={() => setAssign(null)} style={btn('ghost')}>Cancelar</button><button onClick={confirmAssign} disabled={busy || !assign.userId} style={btn('primary', { opacity: assign.userId ? 1 : 0.5 })}><UserPlus size={14} /> {busy ? 'Atribuindo…' : 'Atribuir'}</button></>}>
          <AgentPick radio agents={agents.agents} checked={id => assign.userId === id} onToggle={id => setAssign({ ...assign, userId: id })} />
        </Modal>
      )}
    </div>
  )
}
