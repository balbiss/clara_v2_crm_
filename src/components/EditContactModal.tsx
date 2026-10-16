import { useEffect, type FormEvent } from 'react'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import { isFullPortfolio as isFullPortfolioRole, isCriticalConfig } from '../config/roles'
import { useContactFields } from '../composables/useContactFields'
import { useLocal, readUser } from '../lib/hooks'
import '../styles/vue/EditContactModal.scss'

// Porte de components/EditContactModal.vue
/* eslint-disable @typescript-eslint/no-explicit-any */
const CADASTRO_KEYS = ['instagram', 'id_jueri', 'origem']
// sincronizados do Jueri: têm exibição própria e não podem virar "atributo personalizado" removível
const JUERI_CADASTRO_KEYS = [
  'gerente_jueri_id', 'gerente_jueri_nome', 'supervisor_nome', 'rg', 'profissao', 'razao_social', 'nome_fantasia', 'cnpj',
  'observacao_jueri', 'observacao_interna_jueri', 'data_inativacao_jueri', 'local_trabalho', 'website_jueri', 'referencia_nome',
  'referencia_telefone', 'status_cadastral_jueri', 'data_criacao_jueri', 'data_ultima_alteracao_jueri',
]
const removeBtnStyle = { padding: 10, height: 38, borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const
const addBtnStyle = { background: 'none', border: 'none', color: '#ff007f', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', padding: 0, marginTop: 5 } as const
const hintStyle = { fontSize: '0.85rem', color: '#6b7280', marginBottom: 12, marginTop: -10 } as const

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
  const pairs: any[][] = []
  for (let i = 0; i < REVENDA_FIELDS.length; i += 2) pairs.push([REVENDA_FIELDS[i], REVENDA_FIELDS[i + 1]])

  return (
    <div className="vs-EditContactModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal-sidebar">
          <div className="modal-header">
            <div className="title-section">
              <h2>Editar contato - {contact?.name}</h2>
              <p className="subtitle">Alterar detalhes do contato</p>
            </div>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>

          <div className="modal-body">
            <form onSubmit={save}>
              <div className="form-section">
                <h3>Dados Pessoais</h3>
                <div className="form-group avatar-group">
                  <label>Avatar do Contato</label>
                  <div className="avatar-preview">
                    {contact?.avatar_url ? <img src={contact.avatar_url} alt="Avatar" /> : <div className="avatar-placeholder">{contact?.name?.substring(0, 2).toUpperCase() || 'NA'}</div>}
                  </div>
                </div>
                <div className="form-group">
                  <label>Nome Completo</label>
                  <input type="text" value={fd.name} onChange={e => { s.formData.name = e.target.value }} placeholder="Nome do contato" required autoComplete="off" />
                </div>
                {isFullPortfolio && (
                  <div className="form-group">
                    <label>Responsável (consultor)</label>
                    <select value={fd.user_id ?? ''} onChange={e => { s.formData.user_id = e.target.value ? Number(e.target.value) : null }}>
                      <option value="">Sem responsável</option>
                      {store.agents.map((agent: any) => <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Endereço de e-mail</label>
                  <input type="email" value={fd.email} onChange={e => { s.formData.email = e.target.value }} placeholder="Insira o endereço de e-mail do contato" autoComplete="off" />
                </div>
                <div className="form-group">
                  <label>Número de Telefone</label>
                  <div className="phone-input-wrapper">
                    <select className="country-select"><option value="BR">BR ▾</option></select>
                    <input type="text" value={fd.phone} onChange={e => { s.formData.phone = e.target.value }} placeholder="+5511999999999" autoComplete="off" />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Telefones Adicionais</h3>
                <p style={hintStyle}>Mesma revendedora pode falar por vários números (pessoal, mãe, sócia etc.) — todos ficam vinculados a este cadastro único (briefing seção 7).</p>
                {fd.telefonesAdicionais.map((tel: any, index: number) => (
                  <div key={index} className="form-row" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      {index === 0 && <label>Identificação</label>}
                      <input type="text" value={tel.label} onChange={e => { s.formData.telefonesAdicionais[index].label = e.target.value }} placeholder="Ex: Telefone da mãe" autoComplete="off" />
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      {index === 0 && <label>Número</label>}
                      <input type="text" value={tel.numero} onChange={e => { s.formData.telefonesAdicionais[index].numero = e.target.value }} placeholder="+5511999999999" autoComplete="off" />
                    </div>
                    <button type="button" onClick={() => s.formData.telefonesAdicionais.splice(index, 1)} className="btn-cancel" style={removeBtnStyle} title="Remover">Remover</button>
                  </div>
                ))}
                <button type="button" onClick={() => s.formData.telefonesAdicionais.push({ label: '', numero: '' })} style={addBtnStyle}>+ Adicionar telefone</button>
              </div>

              <div className="form-section">
                <h3>Dados da Revenda</h3>
                <p style={hintStyle}>Campos usados na aba Principal e no funil Consignado.</p>
                {pairs.map(pair => (
                  <div className="form-row" key={pair[0].key}>
                    <div className="form-group half">
                      <label>{pair[0].label}</label>
                      <input type="text" value={fd.revenda[pair[0].key] ?? ''} onChange={e => { s.formData.revenda[pair[0].key] = e.target.value }} autoComplete="off" />
                    </div>
                    {pair[1] && (
                      <div className="form-group half">
                        <label>{pair[1].label}</label>
                        <input type="text" value={fd.revenda[pair[1].key] ?? ''} onChange={e => { s.formData.revenda[pair[1].key] = e.target.value }} autoComplete="off" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="form-section">
                <h3>Outras Informações</h3>
                <div className="form-group">
                  <label>Descrição</label>
                  <textarea value={fd.bio} onChange={e => { s.formData.bio = e.target.value }} placeholder="Insira a descrição do contato" rows={3}></textarea>
                </div>
              </div>

              <div className="form-section">
                <h3>Atributos Personalizados</h3>
                <p style={hintStyle}>Crie campos adicionais livremente (ex: Cor do carro, Hobby, Renda do cônjuge).</p>
                {fd.customAttributesArray.map((attr: any, index: number) => (
                  <div key={index} className="form-row" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      {index === 0 && <label>Nome do Campo</label>}
                      <input type="text" value={attr.key} onChange={e => { s.formData.customAttributesArray[index].key = e.target.value }} placeholder="Ex: Possui Pets?" autoComplete="off" />
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      {index === 0 && <label>Valor</label>}
                      <input type="text" value={attr.value ?? ''} onChange={e => { s.formData.customAttributesArray[index].value = e.target.value }} placeholder="Ex: Sim, 2 cachorros" autoComplete="off" />
                    </div>
                    {canRemoveCustomField && (
                      <button type="button" onClick={() => s.formData.customAttributesArray.splice(index, 1)} className="btn-cancel" style={removeBtnStyle} title="Remover (só diretoria)">Remover</button>
                    )}
                  </div>
                ))}
                {canAddCustomField
                  ? <button type="button" onClick={() => s.formData.customAttributesArray.push({ key: '', value: '' })} style={addBtnStyle}>+ Adicionar novo atributo</button>
                  : <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '4px 0 0' }}>Só gerente ou superior pode criar campos novos — você pode editar os valores acima.</p>}
              </div>
            </form>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={() => save()} disabled={v.loading}>{v.loading ? 'Salvando...' : 'Salvar Alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
