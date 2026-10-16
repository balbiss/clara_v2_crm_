import { useEffect, type FormEvent } from 'react'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import { isFullPortfolio as isFullPortfolioRole, isCriticalConfig } from '../config/roles'
import { useContactFields } from '../composables/useContactFields'
import { useLocal, readUser } from '../lib/hooks'
import { Modal, btn, inputStyle, labelStyle, serif } from './ui'

// Porte de components/EditContactModal.vue
/* eslint-disable @typescript-eslint/no-explicit-any */
const CADASTRO_KEYS = ['instagram', 'id_jueri', 'origem']
// sincronizados do Jueri: têm exibição própria e não podem virar "atributo personalizado" removível
const JUERI_CADASTRO_KEYS = [
  'gerente_jueri_id', 'gerente_jueri_nome', 'supervisor_nome', 'rg', 'profissao', 'razao_social', 'nome_fantasia', 'cnpj',
  'observacao_jueri', 'observacao_interna_jueri', 'data_inativacao_jueri', 'local_trabalho', 'website_jueri', 'referencia_nome',
  'referencia_telefone', 'status_cadastral_jueri', 'data_criacao_jueri', 'data_ultima_alteracao_jueri',
]

export default function EditContactModal({ isOpen, contact, onClose }: { isOpen: boolean; contact?: any; onClose: () => void }) {
  const store = useSnapshot(conversationsStore)
  const currentUser = readUser()
  // só quem vê a carteira toda reatribui responsável; criar atributo: gerente+; remover: diretoria
  const isFullPortfolio = isFullPortfolioRole(currentUser)
  const canAddCustomField = isFullPortfolioRole(currentUser)
  const canRemoveCustomField = isCriticalConfig(currentUser)
  const { allFields: REVENDA_FIELDS } = useContactFields()
  const reservedKeys = () => [...REVENDA_FIELDS.map((f: any) => f.key), ...CADASTRO_KEYS, ...JUERI_CADASTRO_KEYS, 'pedidos', 'telefones_adicionais']

  const [s, v] = useLocal(() => ({ formData: {} as any, loading: false }))

  useEffect(() => {
    if (isFullPortfolio && !conversationsStore.agents.length) conversationsStore.fetchAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recarrega o formulário ao abrir / trocar de contato (não a cada atualização em tempo real)
  useEffect(() => {
    const active = conversationsStore.activeConversation
    const c = contact && active?.contact?.id === contact.id ? active.contact : contact
    if (!c) return
    const custom = c.custom_attributes || {}
    const revenda: Record<string, string> = {}
    REVENDA_FIELDS.forEach((f: any) => { revenda[f.key] = custom[f.key] || '' })
    const cadastro: Record<string, string> = {}
    CADASTRO_KEYS.forEach(k => { cadastro[k] = custom[k] || '' })
    s.formData = {
      name: c.name || '', user_id: c.user_id ?? null, email: c.email || '', phone: c.phone || '', bio: c.bio || '',
      company_name: c.company_name || '', country: c.country || '', city: c.city || '', cpf: c.cpf || '', birth_date: c.birth_date || '',
      cep: c.cep || '', street: c.street || '', neighborhood: c.neighborhood || '', state: c.state || '',
      address_number: c.address_number || '', address_complement: c.address_complement || '',
      revenda, cadastro,
      // fonte de verdade é a tabela reseller_phones
      telefonesAdicionais: Array.isArray(c.reseller_phones)
        ? c.reseller_phones.map((rp: any) => ({ label: rp.label || '', numero: rp.phone }))
        : (Array.isArray(custom.telefones_adicionais) ? custom.telefones_adicionais.map((t: any) => ({ ...t })) : []),
      customAttributesArray: Object.keys(custom).filter(k => !reservedKeys().includes(k)).map(k => ({ key: k, value: custom[k] })),
      _originalCustomAttributes: JSON.parse(JSON.stringify(custom)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contact?.id, REVENDA_FIELDS.length])

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!contact) return
    s.loading = true
    const dataToSave: any = JSON.parse(JSON.stringify(s.formData))
    // preserva chaves não gerenciadas por este modal e sobrescreve só o que ele edita
    const custom_attributes: any = { ...(dataToSave._originalCustomAttributes || {}) }
    Object.keys(custom_attributes).forEach(k => { if (!reservedKeys().includes(k)) delete custom_attributes[k] })
    REVENDA_FIELDS.forEach((f: any) => {
      if (dataToSave.revenda[f.key] === undefined) return // campo não carregado: mantém o salvo
      if (dataToSave.revenda[f.key]) custom_attributes[f.key] = dataToSave.revenda[f.key]
      else delete custom_attributes[f.key]
    })
    CADASTRO_KEYS.forEach(k => { if (dataToSave.cadastro[k]) custom_attributes[k] = dataToSave.cadastro[k]; else delete custom_attributes[k] })
    const validPhones = dataToSave.telefonesAdicionais.filter((t: any) => t.numero && t.numero.trim())
    if (validPhones.length) custom_attributes.telefones_adicionais = validPhones
    else delete custom_attributes.telefones_adicionais
    dataToSave.customAttributesArray.forEach((attr: any) => { if (attr.key && attr.key.trim()) custom_attributes[attr.key.trim()] = attr.value })
    dataToSave.custom_attributes = custom_attributes
    delete dataToSave.customAttributesArray; delete dataToSave.revenda; delete dataToSave.cadastro
    delete dataToSave.telefonesAdicionais; delete dataToSave._originalCustomAttributes
    try {
      await conversationsStore.updateContact(contact.id, dataToSave)
      onClose()
    } catch {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao salvar contato.', showConfirmButton: false, timer: 3500 })
    } finally {
      s.loading = false
    }
  }

  if (!isOpen || !v.formData.revenda) return null
  const fd = v.formData
  const section = (title: string, hint?: string) => (
    <div style={{ margin: '18px 0 10px', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <h3 style={{ ...serif, fontSize: 18, margin: 0 }}>{title}</h3>
      {hint && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
  const linkBtn = { border: 'none', background: 'none', color: 'var(--terra)', fontSize: 12.5, fontWeight: 700, padding: 0, marginTop: 4 } as const
  const removeBtn = { border: '1px solid var(--line)', background: 'none', color: '#B42318', borderRadius: 8, padding: '0 10px', fontSize: 12, flex: 'none' } as const

  return (
    <Modal title={`Editar ${contact?.name || 'contato'}`} subtitle="Dados do Jueri (CPF, endereço, nascimento) não são editados aqui — vêm da sincronização." onClose={onClose} width={600}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Cancelar</button>
        <button onClick={() => save()} disabled={v.loading} style={btn('primary')}>{v.loading ? 'Salvando…' : 'Salvar alterações'}</button>
      </>}>
      <form onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} data-modal-grid>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>Nome completo</span>
            <input value={fd.name} onChange={e => { s.formData.name = e.target.value }} required autoComplete="off" style={inputStyle} />
          </div>
          {isFullPortfolio && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Responsável (carteira)</span>
              <select value={fd.user_id ?? ''} onChange={e => { s.formData.user_id = e.target.value ? Number(e.target.value) : null }} style={inputStyle}>
                <option value="">Sem responsável</option>
                {store.agents.map((a: any) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <span style={labelStyle}>E-mail</span>
            <input type="email" value={fd.email} onChange={e => { s.formData.email = e.target.value }} autoComplete="off" style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>Telefone</span>
            <input value={fd.phone} onChange={e => { s.formData.phone = e.target.value }} placeholder="+5511999999999" autoComplete="off" style={inputStyle} />
          </div>
        </div>

        {section('Telefones adicionais', 'A mesma revendedora pode falar por vários números (mãe, sócia…) — todos ficam ligados a este cadastro.')}
        {fd.telefonesAdicionais.map((tel: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={tel.label} onChange={e => { s.formData.telefonesAdicionais[i].label = e.target.value }} placeholder="Ex: telefone da mãe" autoComplete="off" style={inputStyle} />
            <input value={tel.numero} onChange={e => { s.formData.telefonesAdicionais[i].numero = e.target.value }} placeholder="+5511999999999" autoComplete="off" style={inputStyle} />
            <button type="button" onClick={() => s.formData.telefonesAdicionais.splice(i, 1)} style={removeBtn}>Remover</button>
          </div>
        ))}
        <button type="button" onClick={() => s.formData.telefonesAdicionais.push({ label: '', numero: '' })} style={linkBtn}>+ Adicionar telefone</button>

        {section('Dados da revenda', 'Campos da aba Principal e do funil Consignado.')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} data-modal-grid="2">
          {REVENDA_FIELDS.map((f: any) => (
            <div key={f.key}>
              <span style={labelStyle}>{f.label}</span>
              <input value={fd.revenda[f.key] ?? ''} onChange={e => { s.formData.revenda[f.key] = e.target.value }} autoComplete="off" style={inputStyle} />
            </div>
          ))}
        </div>

        {section('Descrição')}
        <textarea value={fd.bio} onChange={e => { s.formData.bio = e.target.value }} rows={3} placeholder="Observações sobre a revendedora" style={{ ...inputStyle, resize: 'vertical' }} />

        {section('Atributos personalizados', 'Campos livres (ex.: cor preferida, hobby).')}
        {fd.customAttributesArray.map((attr: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={attr.key} onChange={e => { s.formData.customAttributesArray[i].key = e.target.value }} placeholder="Nome do campo" autoComplete="off" style={inputStyle} />
            <input value={attr.value ?? ''} onChange={e => { s.formData.customAttributesArray[i].value = e.target.value }} placeholder="Valor" autoComplete="off" style={inputStyle} />
            {canRemoveCustomField && <button type="button" onClick={() => s.formData.customAttributesArray.splice(i, 1)} title="Remover (só diretoria)" style={removeBtn}>Remover</button>}
          </div>
        ))}
        {canAddCustomField
          ? <button type="button" onClick={() => s.formData.customAttributesArray.push({ key: '', value: '' })} style={linkBtn}>+ Adicionar atributo</button>
          : <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>Só gerente ou superior cria campos novos — você pode editar os valores acima.</p>}
      </form>
    </Modal>
  )
}
