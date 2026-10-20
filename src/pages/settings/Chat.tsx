import { useEffect, useState } from 'react'
import api from '../../api'
import { toast } from '../../components/ui2'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, SettingsRow, settingsInput } from '../../components/SettingsLayout'

// "Configurações de chat" (Ferramentas de comunicação) do Kommo. "Fechar conversa automaticamente"
// é aplicado pelo job auto_close_conversations (a cada 5 min).
/* eslint-disable @typescript-eslint/no-explicit-any */
const NOVA_CONVERSA: [string, string][] = [
  ['new_lead', 'Crie um novo perfil de lead e adicione no local'],
  ['active_lead', 'Adicione-a ao seu perfil existente caso ele já esteja em uma etapa ativa do funil de vendas'],
  ['any_lead', 'Adicione-a ao seu perfil existente, não importa se ele está em uma etapa ativa ou desativada'],
]

export default function Chat() {
  const [w, setW] = useState<any>(null)
  const [orig, setOrig] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get('/workspace_settings').then(({ data }) => { setW(data); setOrig(JSON.stringify(data.settings)) }) }, [])
  if (!w) return <SettingsHead title="Configurações de chat" />
  const s = w.settings
  const set = (k: string, v: any) => setW((x: any) => ({ ...x, settings: { ...x.settings, [k]: v } }))
  const dirty = JSON.stringify(s) !== orig
  const save = async () => {
    setSaving(true)
    try {
      const { data } = await api.put('/workspace_settings', { settings: { auto_close: s.auto_close, new_conversation: s.new_conversation, slow_reply_minutes: s.slow_reply_minutes } })
      setW(data); setOrig(JSON.stringify(data.settings)); toast('success', 'Configurações salvas.')
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar.') } finally { setSaving(false) }
  }
  return (
    <>
      <SettingsHead title="Ferramentas de comunicação" dirty={dirty} saving={saving} onSave={save} />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Fechar conversas" description="A conversa que ficar sem a mensagem do cliente ser lida por esse tempo é fechada automaticamente.">
          <SettingsRow label="Fechar automaticamente depois de">
            <select value={s.auto_close} onChange={e => set('auto_close', e.target.value)} style={settingsInput}>
              <option value="never">Nunca fechar automaticamente</option><option value="1h">1 hora</option><option value="1d">1 dia</option><option value="3d">3 dias</option><option value="1w">1 semana</option>
            </select>
          </SettingsRow>
        </SettingsBlock>
        <SettingsBlock title="Iniciando conversas" description="Quando um lead te mandar uma mensagem e você ainda não tem uma conversa ativa com ele, uma nova será aberta. Onde você gostaria de começar a nova conversa?">
          {NOVA_CONVERSA.map(([v, l]) => (
            <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5, padding: '6px 0', cursor: 'pointer' }}>
              <input type="radio" name="new_conversation" checked={s.new_conversation === v} onChange={() => set('new_conversation', v)} style={{ marginTop: 3 }} />{l}
            </label>
          ))}
        </SettingsBlock>
        <SettingsBlock title="Registrar respostas lentas" description="A partir de quantos minutos sem resposta da equipe a conversa conta como resposta lenta nos relatórios (0 = não registrar).">
          <SettingsRow label="Minutos"><input type="number" min={0} value={s.slow_reply_minutes} onChange={e => set('slow_reply_minutes', Math.max(0, Number(e.target.value)))} style={{ ...settingsInput, width: 120 }} /></SettingsRow>
          <p style={{ fontSize: 13, color: K.muted, margin: '6px 0 0' }}>Usado pelo Painel (Insights) pra destacar conversas esperando resposta.</p>
        </SettingsBlock>
      </div>
    </>
  )
}
