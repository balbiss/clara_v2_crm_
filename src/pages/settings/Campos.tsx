import FieldSetup from '../../components/FieldSetup'
import { SettingsHead } from '../../components/SettingsLayout'

// Configurações › Campos e grupos: o mesmo painel do card do lead, aberto direto na página.
export default function Campos() {
  return (
    <>
      <SettingsHead title="Campos e grupos" />
      <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}><FieldSetup inline onClose={() => {}} /></div>
    </>
  )
}
