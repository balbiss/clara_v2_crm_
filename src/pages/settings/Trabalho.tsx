import { useEffect, useState } from 'react'
import { Copy, X } from 'lucide-react'
import api from '../../api'
import { toast } from '../../components/ui2'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, SettingsRow, settingsInput } from '../../components/SettingsLayout'

// "Configurações de trabalho" do Kommo: configurações gerais da área de trabalho, acesso por país
// e chats diretos. Salva em accounts.settings (PUT /workspace_settings).
/* eslint-disable @typescript-eslint/no-explicit-any */
const PAISES: Record<string, string> = { BR: 'Brasil', PT: 'Portugal', US: 'Estados Unidos', AR: 'Argentina', PY: 'Paraguai', UY: 'Uruguai' }
const FUSOS: Record<string, string> = { 'America/Sao_Paulo': '(GMT -03:00) São Paulo', 'America/Belem': '(GMT -03:00) Belém', 'America/Manaus': '(GMT -04:00) Manaus', 'America/Cuiaba': '(GMT -04:00) Cuiabá', 'America/Rio_Branco': '(GMT -05:00) Rio Branco', 'America/Noronha': '(GMT -02:00) Fernando de Noronha' }

export default function Trabalho() {
  const [w, setW] = useState<any>(null)
  const [orig, setOrig] = useState('')
  const [saving, setSaving] = useState(false)
  const [addPais, setAddPais] = useState('')
  useEffect(() => { api.get('/workspace_settings').then(({ data }) => { setW(data); setOrig(JSON.stringify(data)) }) }, [])
  if (!w) return <SettingsHead title="Configurações de trabalho" />
  const s = w.settings
  const set = (k: string, v: any) => setW((x: any) => ({ ...x, settings: { ...x.settings, [k]: v } }))
  const dirty = JSON.stringify(w) !== orig
  const save = async () => {
    setSaving(true)
    try { const { data } = await api.put('/workspace_settings', { name: w.name, settings: w.settings }); setW(data); setOrig(JSON.stringify(data)); toast('success', 'Configurações salvas.') }
    catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar.') } finally { setSaving(false) }
  }
  const sel = (k: string, opts: Record<string, string>) => <select value={s[k]} onChange={e => set(k, e.target.value)} style={settingsInput}>{Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>

  return (
    <>
      <SettingsHead title="Configurações de trabalho" dirty={dirty} saving={saving} onSave={save} />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Configurações gerais" description="Nome e preferências de data, hora, moeda e nomes usados na área de trabalho.">
          <SettingsRow label="ID da área de trabalho"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{w.id}<button title="Copiar" onClick={() => { navigator.clipboard?.writeText(String(w.id)); toast('success', 'ID copiado.') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}><Copy size={14} /></button></span></SettingsRow>
          <SettingsRow label="Nome da área de trabalho"><input value={w.name || ''} onChange={e => setW({ ...w, name: e.target.value })} style={settingsInput} /></SettingsRow>
          <SettingsRow label="Fuso horário">{sel('timezone', FUSOS)}</SettingsRow>
          <SettingsRow label="País">{sel('country', PAISES)}</SettingsRow>
          <SettingsRow label="Formato de data">{sel('date_format', { 'dd/mm/aaaa': '31/12/2026', 'mm/dd/aaaa': '12/31/2026', 'aaaa-mm-dd': '2026-12-31' })}</SettingsRow>
          <SettingsRow label="Formato de hora">{sel('time_format', { '24h': '24 horas', '12h': '12 horas' })}</SettingsRow>
          <SettingsRow label="Moeda">{sel('currency', { BRL: 'Real brasileiro', USD: 'Dólar americano', EUR: 'Euro' })}</SettingsRow>
          <SettingsRow label="Formato do nome do contato">{sel('name_format', { first_last: 'Primeiro nome, Sobrenome', last_first: 'Sobrenome, Primeiro nome' })}</SettingsRow>
          <SettingsRow label="Casas decimais da moeda">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, cursor: 'pointer' }}><input type="checkbox" checked={!!s.price_decimals} onChange={e => set('price_decimals', e.target.checked)} /> Mostra todos os dígitos após a vírgula nos preços</label>
          </SettingsRow>
        </SettingsBlock>
        <SettingsBlock title="Acesso à área de trabalho por país" description="Países de onde os usuários podem acessar a área de trabalho.">
          <SettingsRow label="Países permitidos">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {(s.allowed_countries || []).map((c: string) => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: `1px solid ${K.lineDark}`, borderRadius: 3, fontSize: 14 }}>{PAISES[c] || c}
                  {(s.allowed_countries || []).length > 1 && <button title="Remover" onClick={() => set('allowed_countries', s.allowed_countries.filter((x: string) => x !== c))} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: K.muted, display: 'flex' }}><X size={12} /></button>}
                </span>
              ))}
              <select value={addPais} onChange={e => { if (e.target.value) set('allowed_countries', [...(s.allowed_countries || []), e.target.value]); setAddPais('') }} style={{ ...settingsInput, width: 160 }}>
                <option value="">+ Adicionar país</option>
                {Object.entries(PAISES).filter(([c]) => !(s.allowed_countries || []).includes(c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
          </SettingsRow>
        </SettingsBlock>
        <SettingsBlock title="Chats diretos" description="Quem pode criar grupos no Chat da Equipe.">
          <SettingsRow label="Capacidade de criar grupos de chats">{sel('group_chats', { all: 'Todos', admins: 'Somente administradores', none: 'Ninguém' })}</SettingsRow>
        </SettingsBlock>
      </div>
    </>
  )
}
