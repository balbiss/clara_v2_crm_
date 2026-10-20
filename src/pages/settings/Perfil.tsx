import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import api from '../../api'
import { toast } from '../../components/ui2'
import { readUser } from '../../lib/hooks'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, SettingsRow, settingsInput } from '../../components/SettingsLayout'

// "Configurações de perfil" do Kommo: dados do próprio usuário, foto e troca de senha.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Perfil() {
  const [p, setP] = useState<any>(null)
  const [orig, setOrig] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [avatar, setAvatar] = useState<string | null>(() => readUser()?.avatar_url || null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { api.get('/profile').then(({ data }) => { setP(data); setOrig(data) }) }, [])
  if (!p) return <SettingsHead title="Configurações de perfil" />
  const dirty = ['first_name', 'last_name', 'phone'].some(k => (p[k] || '') !== (orig[k] || ''))
  const set = (k: string, v: string) => setP((x: any) => ({ ...x, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await api.put('/profile', { profile: { first_name: p.first_name, last_name: p.last_name, phone: p.phone } })
      setP(data); setOrig(data)
      const u = readUser(); localStorage.setItem('user', JSON.stringify({ ...u, first_name: data.first_name, last_name: data.last_name }))
      toast('success', 'Perfil salvo.')
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar.') } finally { setSaving(false) }
  }
  const savePw = async () => {
    if (pw.password !== pw.password_confirmation) return toast('warning', 'A nova senha e a confirmação não batem.')
    try { const { data } = await api.put('/account/update_password', { user: pw }); toast('success', data.message || 'Senha alterada.'); setPw({ current_password: '', password: '', password_confirmation: '' }) }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível alterar a senha.') }
  }
  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const fd = new FormData(); fd.append('avatar', f)
    try { const { data } = await api.patch('/profile/avatar', fd, { headers: { 'Content-Type': undefined } }); setAvatar(data.avatar_url); localStorage.setItem('user', JSON.stringify({ ...readUser(), avatar_url: data.avatar_url })); toast('success', 'Foto alterada.') }
    catch { toast('error', 'Não foi possível trocar a foto.') }
  }

  return (
    <>
      <SettingsHead title="Configurações de perfil" dirty={dirty} saving={saving} onSave={save} />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Configurações de perfil">
          <SettingsRow label="ID do usuário"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{p.id}<button title="Copiar" onClick={() => { navigator.clipboard?.writeText(String(p.id)); toast('success', 'ID copiado.') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}><Copy size={14} /></button></span></SettingsRow>
          <SettingsRow label="Foto">
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {avatar ? <img src={avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#fbe9ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: K.blue }}>{(p.first_name || '?')[0]}</span>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
              <button onClick={() => fileRef.current?.click()} style={{ border: 'none', background: 'none', color: K.link, textDecoration: 'underline', cursor: 'pointer', fontFamily: K.font, fontSize: 14.5 }}>Alterar foto</button>
            </span>
          </SettingsRow>
          <SettingsRow label="Nome"><input value={p.first_name || ''} onChange={e => set('first_name', e.target.value)} style={settingsInput} /></SettingsRow>
          <SettingsRow label="Sobrenome"><input value={p.last_name || ''} onChange={e => set('last_name', e.target.value)} style={settingsInput} /></SettingsRow>
          <SettingsRow label="Telefone"><input value={p.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="(14) 99999-9999" style={settingsInput} /></SettingsRow>
          <SettingsRow label="E-mail"><input value={p.email || ''} readOnly style={{ ...settingsInput, background: '#f5f5f5', color: K.muted }} /></SettingsRow>
          <SettingsRow label="Idioma"><input value="Português" readOnly style={{ ...settingsInput, background: '#f5f5f5', color: K.muted }} /></SettingsRow>
        </SettingsBlock>
        <SettingsBlock title="Senha" description="Use pelo menos 6 caracteres.">
          <SettingsRow label="Senha atual"><input type="password" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} style={settingsInput} autoComplete="current-password" /></SettingsRow>
          <SettingsRow label="Nova senha"><input type="password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} style={settingsInput} autoComplete="new-password" /></SettingsRow>
          <SettingsRow label="Confirmar nova senha"><input type="password" value={pw.password_confirmation} onChange={e => setPw({ ...pw, password_confirmation: e.target.value })} style={settingsInput} autoComplete="new-password" /></SettingsRow>
          <button onClick={savePw} disabled={!pw.current_password || !pw.password} style={{ marginTop: 10, height: 36, padding: '0 16px', border: 'none', borderRadius: 3, background: pw.current_password && pw.password ? K.blue : '#c5cbd1', color: '#fff', fontFamily: K.font, fontWeight: 700, cursor: 'pointer' }}>Alterar senha</button>
        </SettingsBlock>
      </div>
    </>
  )
}
