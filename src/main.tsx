import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { can } from './lib/acesso'
import { KOMMO_NAV } from './lib/navKommo'
import { readUser } from './lib/hooks'
import ComingSoon from './pages/ComingSoon'

const Login = lazy(() => import('./pages/Login'))
import { AppShell } from './components/AppShell'
const Conversas = lazy(() => import('./pages/Conversas'))
const Kanban = lazy(() => import('./pages/Kanban'))
const Funis = lazy(() => import('./pages/Funis'))
const SalesbotList = lazy(() => import('./pages/SalesbotList'))
const Gerencial = lazy(() => import('./pages/insights/Gerencial'))
const Inicio = lazy(() => import('./pages/Inicio'))
const TeamChat = lazy(() => import('./pages/TeamChat'))
const Disparos = lazy(() => import('./pages/Disparos'))
const AgentesIA = lazy(() => import('./pages/AgentesIA'))
const AgenteIAEditor = lazy(() => import('./pages/AgenteIAEditor'))
const Relatorios = lazy(() => import('./pages/insights/Relatorios'))
const RegistroAtividades = lazy(() => import('./pages/insights/RegistroAtividades'))
const SalesbotEditor = lazy(() => import('./pages/SalesbotEditor'))
const Calendario = lazy(() => import('./pages/Calendario'))
const SettingsLayout = lazy(() => import('./components/SettingsLayout'))
const Perfil = lazy(() => import('./pages/settings/Perfil'))
const Trabalho = lazy(() => import('./pages/settings/Trabalho'))
const ChatSettings = lazy(() => import('./pages/settings/Chat'))
const PerfisAcesso = lazy(() => import('./pages/settings/PerfisAcesso'))
const Integracoes = lazy(() => import('./pages/settings/Integracoes'))
const MotivosPerda = lazy(() => import('./pages/settings/MotivosPerda'))
const CamposPage = lazy(() => import('./pages/settings/Campos'))
const FunilAutomatize = lazy(() => import('./pages/FunilAutomatize'))
const ContactDetails = lazy(() => import('./pages/ContactDetails'))
const Contacts = lazy(() => import('./pages/Contacts'))
const PedidosPendentes = lazy(() => import('./pages/PedidosPendentes'))
const AtacadoView = lazy(() => import('./pages/AtacadoView'))
const RevendedorasInativas = lazy(() => import('./pages/RevendedorasInativas'))
const RevendedorasAtivas = lazy(() => import('./pages/RevendedorasAtivas'))
const MessageTemplates = lazy(() => import('./pages/settings/MessageTemplates'))
const ContactFieldGroups = lazy(() => import('./pages/settings/ContactFieldGroups'))
const SalesTeams = lazy(() => import('./pages/settings/SalesTeams'))
const Tags = lazy(() => import('./pages/settings/Tags'))
const Account = lazy(() => import('./pages/settings/Account'))
const SettingsInboxDetail = lazy(() => import('./pages/SettingsInboxDetail'))
const NewInbox = lazy(() => import('./pages/NewInbox'))
const SettingsInboxes = lazy(() => import('./pages/SettingsInboxes'))
const AgentForm = lazy(() => import('./pages/AgentForm'))
const Agents = lazy(() => import('./pages/Agents'))

// Tela que o perfil de acesso não libera: vai pra primeira do menu que ele pode abrir.
function primeiraTela() {
  const paths = KOMMO_NAV.flatMap(gr => gr.children ? gr.children : [gr as { path: string; rule: string }]).filter(i => i.path && can(i.rule || 'all')).map(i => i.path)
  return paths[0] || '/settings/perfil'
}

function Guard({ children, perm }: { children: ReactNode; perm?: string }) {
  const { pathname } = useLocation()
  if (!localStorage.getItem('auth_token')) return <Navigate to="/login" replace />
  if (perm && !can(perm)) { const ir = primeiraTela(); return ir === pathname ? <>{children}</> : <Navigate to={ir} replace /> }
  return <>{children}</>
}

const emMigracao = (title: string) => <ComingSoon title={title} description="Tela em migração para a v2 — ainda não portada." />
const g = (el: ReactNode, perm?: string) => <Guard perm={perm}>{el}</Guard>

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={emMigracao('Esqueci a senha')} />
          <Route path="/users/password/edit" element={emMigracao('Redefinir senha')} />
          <Route path="/" element={g(<AppShell />)}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={g(<Inicio />, 'menu.inicio')} />
            <Route path="carteira" element={g(<RevendedorasAtivas />, 'menu.carteira')} />
            <Route path="inativas" element={g(<RevendedorasInativas />, 'menu.inativas')} />
            <Route path="atacado" element={g(<AtacadoView />, 'menu.atacado')} />
            <Route path="pedidos-pendentes" element={g(<PedidosPendentes />, 'menu.pedidos_pendentes')} />
            <Route path="tarefas" element={g(<Calendario initialView="list" />, 'menu.tarefas')} />
            <Route path="agente-ia" element={g(<AgentesIA />, 'config.agente_ia')} />
            <Route path="agente-ia/:id" element={g(<AgenteIAEditor />, 'config.agente_ia')} />
            <Route path="gerencial" element={g(<Gerencial />, 'insights.gerencial')} />
            <Route path="atividades" element={g(<RegistroAtividades />, 'menu.atividades')} />
            <Route path="conversas" element={g(<Conversas />, 'menu.conversas')} />
            <Route path="conversas/inbox/:inboxId" element={g(<Conversas />, 'menu.conversas')} />
            <Route path="conversas/:filter" element={g(<Conversas />, 'menu.conversas')} />
            <Route path="chat-equipe" element={g(<TeamChat />, 'menu.chat_equipe')} />
            <Route path="disparos" element={g(<Disparos />, 'disparos.usar')} />
            <Route path="disparos/:id" element={g(<Disparos />, 'disparos.usar')} />
            <Route path="contatos" element={g(<Contacts />, 'menu.contatos')} />
            <Route path="contatos/:id" element={g(<ContactDetails />, 'menu.contatos')} />
            <Route path="pipelines/todos-leads" element={g(emMigracao('Todos os leads'), 'menu.todos_leads')} />
            <Route path="pipelines" element={g(<Funis />, 'menu.funis')} />
            <Route path="pipelines/:slug" element={g(<Funis />, 'menu.funis')} />
            <Route path="pipelines/:slug/automatize" element={g(<FunilAutomatize />, 'funis.configurar')} />
            <Route path="calendario" element={g(<Calendario />, 'menu.calendario')} />
            <Route path="automacoes" element={g(<ComingSoon title="Automações" description="Regras automáticas de tarefas e mensagens — ainda não disponível." />, 'config.robos')} />
            <Route path="fluxos" element={g(<SalesbotList />, 'config.robos')} />
            <Route path="fluxos/novo" element={<Navigate to="/fluxos" replace />} />
            <Route path="fluxos/:id" element={g(<SalesbotEditor />, 'config.robos')} />
            {/* Configurações no layout do Kommo: menu próprio + página (components/SettingsLayout) */}
            <Route element={<SettingsLayout />}>
              <Route path="settings" element={<Navigate to="/settings/perfil" replace />} />
              <Route path="settings/perfil" element={g(<Perfil />)} />
              <Route path="settings/trabalho" element={g(<Trabalho />, 'config.trabalho')} />
              <Route path="settings/chat" element={g(<ChatSettings />, 'config.trabalho')} />
              <Route path="settings/perfis-acesso" element={g(<PerfisAcesso />, 'owner')} />
              <Route path="settings/integracoes" element={g(<Integracoes />, 'config.integracoes')} />
              <Route path="settings/motivos-perda" element={g(<MotivosPerda />, 'config.motivos_perda')} />
              <Route path="agentes" element={g(<Agents />, 'config.usuarios')} />
              <Route path="agentes/novo" element={g(<AgentForm />, 'config.usuarios')} />
              <Route path="agentes/:id/editar" element={g(<AgentForm />, 'config.usuarios')} />
              <Route path="settings/inboxes" element={g(<SettingsInboxes />, 'config.canais')} />
              <Route path="settings/inboxes/new" element={g(<NewInbox />)} />
              <Route path="settings/inboxes/:id" element={g(<SettingsInboxDetail />)} />
              <Route path="settings/account" element={<Navigate to="/settings/trabalho" replace />} />
              <Route path="settings/tags" element={g(<Tags />, 'config.etiquetas')} />
              <Route path="settings/times-de-vendas" element={g(<SalesTeams />, 'config.grupos_usuarios')} />
              <Route path="settings/campos-contato" element={g(<CamposPage />, 'config.campos')} />
              <Route path="settings/modelos-mensagem" element={g(<MessageTemplates />, 'config.modelos')} />
            </Route>
            <Route path="funil" element={g(<Kanban />, 'menu.consignado')} />
            <Route path="funil/automatize" element={<Navigate to="/pipelines/consignado/automatize" replace />} />
            <Route path="relatorios" element={g(<Relatorios />, 'insights.relatorios')} />
            <Route path="manual" element={g(emMigracao('Manual'))} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)

// novo service worker assumiu (nova versão publicada): recarrega uma vez. Na primeira visita
// (ainda não havia service worker) não recarrega — senão a página piscava no meio do uso.
if ('serviceWorker' in navigator) {
  let reloading = false
  const tinhaVersao = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !tinhaVersao) return
    reloading = true
    window.location.reload()
  })
}
