import { useEffect, useMemo, useState } from 'react'
import api from '../../api'
import { toast } from '../../components/ui2'
import { K, kBtn, kInput } from '../../lib/kommo'
import { SettingsHead } from '../../components/SettingsLayout'

// Configurações › Perfis de acesso (Bel, 2026-11-04) — no formato dos "Direitos de acesso" do Kommo.
// O catálogo (tudo que o CRM tem) e o padrão de cada perfil vêm do servidor (server/src/lib/acesso.ts);
// esta tela só mostra e salva. Diretoria tem acesso total e não é editável.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Item = { key: string; label: string; desc?: string; tipo: 'escopo' | 'sim_nao' }
type Grupo = { id: string; label: string; desc?: string; itens: Item[] }
type Perfil = { id: number; name: string; base_role: string; sistema: boolean; editavel: boolean; usuarios: number; permissions: Record<string, any> }

const TIPO_LABEL: Record<string, string> = { consultor: 'Consultor', gerente: 'Gerente', financeiro: 'Financeiro', diretoria: 'Diretoria' }

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 40, height: 22, borderRadius: 11, border: 'none', padding: 2, cursor: disabled ? 'default' : 'pointer', background: on ? K.green : '#cfd3d6', flex: 'none', transition: 'background .15s', opacity: disabled ? 0.7 : 1 }}>
      <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </button>
  )
}

function Escopo({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const opt = (v: string, label: string) => (
    <button type="button" disabled={disabled} onClick={() => onChange(v)}
      style={{ height: 30, padding: '0 12px', border: `1px solid ${value === v ? K.blue : K.lineDark}`, background: value === v ? '#fbe9ee' : '#fff', color: value === v ? K.blueDark : K.text, fontFamily: K.font, fontSize: 13, fontWeight: value === v ? 700 : 400, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
  return <div style={{ display: 'inline-flex', flex: 'none' }}>{opt('todos', 'Todas')}<span style={{ width: 4 }} />{opt('carteira', 'Só da carteira')}</div>
}

export default function PerfisAcesso() {
  const [catalogo, setCatalogo] = useState<Grupo[]>([])
  const [padroes, setPadroes] = useState<Record<string, Record<string, any>>>({})
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [rascunho, setRascunho] = useState<Record<number, { name: string; permissions: Record<string, any> }>>({})
  const [saving, setSaving] = useState(false)
  const [novo, setNovo] = useState<{ name: string; copiar_de: number | '' } | null>(null)
  const [busca, setBusca] = useState('')

  const carregar = async (manter?: number) => {
    const { data } = await api.get('/access_profiles')
    setCatalogo(data.catalogo); setPadroes(data.padroes); setPerfis(data.perfis)
    setSelId(id => manter ?? id ?? data.perfis[0]?.id ?? null)
  }
  useEffect(() => { carregar().catch(e => toast('error', e.response?.data?.message || 'Não foi possível carregar os perfis.')) }, [])

  const sel = perfis.find(p => p.id === selId) || null
  const atual = sel ? (rascunho[sel.id] ?? { name: sel.name, permissions: sel.permissions }) : null
  const dirty = !!(sel && rascunho[sel.id] && (JSON.stringify(rascunho[sel.id].permissions) !== JSON.stringify(sel.permissions) || rascunho[sel.id].name !== sel.name))
  const sujos = useMemo(() => new Set(perfis.filter(p => rascunho[p.id] && (JSON.stringify(rascunho[p.id].permissions) !== JSON.stringify(p.permissions) || rascunho[p.id].name !== p.name)).map(p => p.id)), [perfis, rascunho])

  const setPerm = (key: string, v: any) => {
    if (!sel || !atual) return
    setRascunho(r => ({ ...r, [sel.id]: { ...atual, permissions: { ...atual.permissions, [key]: v } } }))
  }
  const setNome = (name: string) => { if (sel && atual) setRascunho(r => ({ ...r, [sel.id]: { ...atual, name } })) }

  const salvar = async () => {
    if (!sel || !atual) return
    setSaving(true)
    try {
      const { data } = await api.put(`/access_profiles/${sel.id}`, { permissions: atual.permissions, ...(sel.sistema ? {} : { name: atual.name }) })
      setPerfis(ps => ps.map(p => p.id === data.id ? data : p))
      setRascunho(r => { const n = { ...r }; delete n[sel.id]; return n })
      toast('success', `Perfil "${data.name}" salvo. Vale na hora para quem usa esse perfil.`)
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar.') } finally { setSaving(false) }
  }

  const criar = async () => {
    if (!novo?.name.trim()) return toast('error', 'Dê um nome ao perfil.')
    try {
      const { data } = await api.post('/access_profiles', { name: novo.name.trim(), copiar_de: novo.copiar_de || undefined, base_role: novo.copiar_de ? undefined : 'consultor' })
      setNovo(null); await carregar(data.id)
      toast('success', `Perfil "${data.name}" criado. Ajuste o que ele pode e salve.`)
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível criar.') }
  }

  const excluir = async () => {
    if (!sel || sel.sistema) return
    const quem = sel.usuarios ? ` As ${sel.usuarios} pessoa(s) desse perfil voltam para o perfil ${TIPO_LABEL[sel.base_role]}.` : ''
    if (!window.confirm(`Excluir o perfil "${sel.name}"?${quem}`)) return
    try {
      await api.delete(`/access_profiles/${sel.id}`)
      setRascunho(r => { const n = { ...r }; delete n[sel.id]; return n })
      setSelId(null); await carregar(perfis.find(p => p.sistema)?.id)
      toast('success', 'Perfil excluído.')
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível excluir.') }
  }

  const restaurar = () => { if (sel && padroes[sel.base_role]) setRascunho(r => ({ ...r, [sel.id]: { name: atual!.name, permissions: { ...padroes[sel.base_role] } } })) }

  const travado = !sel?.editavel
  const termo = busca.trim().toLowerCase()
  const grupos = catalogo.map(g => ({ ...g, itens: g.itens.filter(i => !termo || (i.label + ' ' + (i.desc || '') + ' ' + g.label).toLowerCase().includes(termo)) })).filter(g => g.itens.length)

  return (
    <>
      <SettingsHead title="Perfis de acesso" dirty={dirty} saving={saving} onSave={salvar} />
      <div className="perfis-grid" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) minmax(0, 1fr)', gap: 16, alignItems: 'start', fontFamily: K.font, color: K.text }}>
        <style>{'@media (max-width: 760px) { .perfis-grid { grid-template-columns: 1fr !important } }'}</style>

        {/* lista de perfis */}
        <div style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3 }}>
          <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: K.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${K.line}` }}>Perfis</div>
          {perfis.map(p => (
            <button key={p.id} onClick={() => setSelId(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${K.line}`, background: p.id === selId ? '#fbe9ee' : '#fff', cursor: 'pointer', fontFamily: K.font }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: p.id === selId ? 700 : 400, color: p.id === selId ? K.blueDark : K.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}{sujos.has(p.id) && <span title="Alterações não salvas" style={{ color: K.orange }}> •</span>}
                </span>
                <span style={{ fontSize: 12, color: K.muted }}>{p.sistema ? 'Perfil padrão' : `Baseado em ${TIPO_LABEL[p.base_role]}`} · {p.usuarios} pessoa{p.usuarios === 1 ? '' : 's'}</span>
              </span>
              {!p.editavel && <span style={{ fontSize: 11, color: K.muted }}>🔒</span>}
            </button>
          ))}
          <div style={{ padding: 12 }}>
            {novo ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <input autoFocus value={novo.name} onChange={e => setNovo({ ...novo, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && criar()} placeholder="Nome (ex.: Prospecção)" style={kInput} />
                <label style={{ fontSize: 12, color: K.muted }}>Começar copiando de
                  <select value={novo.copiar_de} onChange={e => setNovo({ ...novo, copiar_de: e.target.value ? Number(e.target.value) : '' })} style={{ ...kInput, marginTop: 4 }}>
                    {perfis.filter(p => p.editavel).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={criar} style={kBtn('blue', { flex: 1, justifyContent: 'center' })}>Criar</button>
                  <button onClick={() => setNovo(null)} style={kBtn('ghost')}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setNovo({ name: '', copiar_de: perfis.find(p => p.base_role === 'consultor' && p.sistema)?.id ?? '' })} style={kBtn('ghost', { width: '100%', justifyContent: 'center' })}>+ Novo perfil</button>
            )}
          </div>
          <p style={{ margin: 0, padding: '0 14px 14px', fontSize: 12, color: K.muted, lineHeight: 1.45 }}>
            Quem usa cada perfil é escolhido em <b>Gestão de usuários</b>, no cadastro da pessoa.
          </p>
        </div>

        {/* permissões do perfil escolhido */}
        {sel && atual ? (
          <div style={{ minWidth: 0 }}>
            <div style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              {sel.sistema || travado
                ? <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: '1 1 200px' }}>{sel.name}</h2>
                : <input value={atual.name} onChange={e => setNome(e.target.value)} aria-label="Nome do perfil" style={{ ...kInput, flex: '1 1 200px', fontSize: 16, fontWeight: 700 }} />}
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar permissão…" style={{ ...kInput, flex: '1 1 180px', maxWidth: 260 }} />
              {!travado && <button onClick={restaurar} title={`Volta tudo para o padrão do perfil ${TIPO_LABEL[sel.base_role]} (como o sistema funcionava antes)`} style={kBtn('ghost')}>Voltar ao padrão</button>}
              {!sel.sistema && <button onClick={excluir} style={kBtn('ghost', { color: '#c0392b' })}>Excluir</button>}
            </div>
            {travado && (
              <div style={{ background: '#fff8e5', border: '1px solid #f3dca0', borderRadius: 3, padding: '10px 14px', fontSize: 14, marginBottom: 12 }}>
                A <b>Diretoria</b> sempre vê e faz tudo no CRM. Esse perfil não pode ser alterado, pra ninguém ficar trancado fora do sistema.
              </div>
            )}
            {!sel.sistema && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: K.muted }}>Baseado no tipo <b>{TIPO_LABEL[sel.base_role]}</b>: quem usa este perfil entra no rodízio e na carteira como {TIPO_LABEL[sel.base_role].toLowerCase()}.</p>
            )}
            {grupos.map(g => (
              <section key={g.id} style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, marginBottom: 12 }}>
                <header style={{ padding: '12px 14px', borderBottom: `1px solid ${K.line}` }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{g.label}</h3>
                  {g.desc && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: K.muted }}>{g.desc}</p>}
                </header>
                {g.itens.map(i => {
                  const v = atual.permissions[i.key]
                  return (
                    <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${K.line}`, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <div style={{ fontSize: 14 }}>{i.label}</div>
                        {i.desc && <div style={{ fontSize: 12, color: K.muted, lineHeight: 1.4 }}>{i.desc}</div>}
                      </div>
                      {i.tipo === 'escopo'
                        ? <Escopo value={v === 'todos' ? 'todos' : 'carteira'} onChange={x => setPerm(i.key, x)} disabled={travado} />
                        : <Toggle on={v === true} onChange={x => setPerm(i.key, x)} disabled={travado} />}
                    </div>
                  )
                })}
              </section>
            ))}
            {!grupos.length && <p style={{ color: K.muted, fontSize: 14 }}>Nenhuma permissão com “{busca}”.</p>}
          </div>
        ) : <p style={{ color: K.muted }}>Carregando…</p>}
      </div>
    </>
  )
}
