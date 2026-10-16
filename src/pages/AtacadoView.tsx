import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { MessageCircle, Package } from 'lucide-react'
import { contactsStore } from '../store/contacts'
import { PageHead, DataTable } from '../components/ui2'
import { SearchBox, Toolbar, NameCell, EmptyBlock, useStartConversation } from '../components/lists'

// Atacado: clientes de compra à vista do Jueri, fora da régua consignada (tela própria)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AtacadoView() {
  const navigate = useNavigate()
  const store = useSnapshot(contactsStore) as any
  const { start, busyId } = useStartConversation()
  const [loading, setLoading] = useState(!contactsStore.isLoadedOnce)
  const [q, setQ] = useState('')
  useEffect(() => { (async () => { try { if (!contactsStore.isLoadedOnce) await contactsStore.fetchContacts() } finally { setLoading(false) } })() }, [])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return store.contacts.filter((c: any) => c.status === 'atacado').filter((c: any) => !s || (c.name || `${c.first_name || ''} ${c.last_name || ''}`).toLowerCase().includes(s) || (c.phone || '').includes(s))
  }, [store.contacts, q])

  return (
    <div>
      <PageHead title="Atacado" subtitle={`Clientes de compra à vista, fora do modelo consignado — ${list.length} cliente${list.length === 1 ? '' : 's'}`} />
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou telefone…" /></Toolbar>
      <DataTable loading={loading} empty={<EmptyBlock icon={<Package size={26} />} title="Nenhum cliente de atacado encontrado" text="Aparece sozinho depois da próxima sincronização com o Jueri." />}
        columns={[{ label: 'Cliente' }, { label: 'Telefone' }, { label: 'Cidade' }, { label: '', width: 50 }]}
        onRowClick={i => navigate(`/contatos/${list[i].id}`)}
        rows={list.map((c: any) => [
          <NameCell key="n" c={c} icon={<Package size={14} />} />, c.phone || '—', c.city || '—',
          <button key="m" title="Iniciar conversa no WhatsApp" disabled={busyId === c.id} onClick={e => { e.stopPropagation(); start(c) }}
            style={{ width: 32, height: 32, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={15} /></button>,
        ])} />
    </div>
  )
}
