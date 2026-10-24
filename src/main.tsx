import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { FULL_PORTFOLIO_ROLES, CRITICAL_CONFIG_ROLES } from './config/roles'
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

// Mesmas regras do router/index.js da v1 (beforeEach).
const FINANCE_BLOCKED = ['/carteira', '/tarefas']

function Guard({ children, fullPortfolio, criticalConfig }: { children: ReactNode; fullPortfolio?: boolean; criticalConfig?: boolean }) {
  const { pathname } = useLocation()
  if (!localStorage.getItem('auth_token')) return <Navigate to="/login" replace />
  const user = readUser()
  if (fullPortfolio && user?.role && !FULL_PORTFOLIO_ROLES.includes(user.role)) return <Navigate to="/dashboard" replace />
  if (criticalConfig && user?.role && !CRITICAL_CONFIG_ROLES.includes(user.role)) return <Navigate to="/dashboard" replace />
  if (user?.role === 'financeiro' && FINANCE_BLOCKED.includes(pathname)) return <Navigate to="/inativas" replace />
  return <>{children}</>
}

const emMigracao = (title: string) => <ComingSoon title={title} description="Tela em migração para a v2 — ainda não portada." />
const g = (el: ReactNode, opts: { fullPortfolio?: boolean; criticalConfig?: boolean } = {}) => <Guard {...opts}>{el}</Guard>

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
            <Route path="dashboard" element={g(<Inicio />)} />
            <Route path="carteira" element={g(<RevendedorasAtivas />)} />
            <Route path="inativas" element={g(<RevendedorasInativas />)} />
            <Route path="atacado" element={g(<AtacadoView />)} />
            <Route path="pedidos-pendentes" element={g(<PedidosPendentes />)} />
            <Route path="tarefas" element={g(<Calendario initialView="list" />)} />
            <Route path="agente-ia" element={g(<AgentesIA />, { criticalConfig: true })} />
            <Route path="agente-ia/:id" element={g(<AgenteIAEditor />, { criticalConfig: true })} />
            <Route path="gerencial" element={g(<Gerencial />, { fullPortfolio: true })} />
            <Route path="atividades" element={g(<RegistroAtividades />, { criticalConfig: true })} />
            <Route path="conversas" element={g(<Conversas />)} />
            <Route path="conversas/inbox/:inboxId" element={g(<Conversas />)} />
            <Route path="conversas/:filter" element={g(<Conversas />)} />
            <Route path="chat-equipe" element={g(<TeamChat />)} />
            <Route path="contatos" element={g(<Contacts />)} />
            <Route path="contatos/:id" element={g(<ContactDetails />)} />
            <Route path="pipelines/todos-leads" element={g(emMigracao('Todos os leads'), { fullPortfolio: true })} />
            <Route path="pipelines" element={g(<Funis />)} />
            <Route path="pipelines/:slug" element={g(<Funis />)} />
            <Route path="pipelines/:slug/automatize" element={g(<FunilAutomatize />, { criticalConfig: true })} />
            <Route path="calendario" element={g(<Calendario />)} />
            <Route path="automacoes" element={g(<ComingSoon title="Automações" description="Regras automáticas de tarefas e mensagens — ainda não disponível." />, { criticalConfig: true })} />
            <Route path="fluxos" element={g(<SalesbotList />, { criticalConfig: true })} />
            <Route path="fluxos/novo" element={<Navigate to="/fluxos" replace />} />
            <Route path="fluxos/:id" element={g(<SalesbotEditor />, { criticalConfig: true })} />
            {/* Configurações no layout do Kommo: menu próprio + página (components/SettingsLayout) */}
            <Route element={<SettingsLayout />}>
              <Route path="settings" element={<Navigate to="/settings/perfil" replace />} />
              <Route path="settings/perfil" element={g(<Perfil />)} />
              <Route path="settings/trabalho" element={g(<Trabalho />, { criticalConfig: true })} />
              <Route path="settings/chat" element={g(<ChatSettings />, { criticalConfig: true })} />
              <Route path="settings/integracoes" element={g(<Integracoes />, { criticalConfig: true })} />
              <Route path="settings/motivos-perda" element={g(<MotivosPerda />, { criticalConfig: true })} />
              <Route path="agentes" element={g(<Agents />, { criticalConfig: true })} />
              <Route path="agentes/novo" element={g(<AgentForm />, { criticalConfig: true })} />
              <Route path="agentes/:id/editar" element={g(<AgentForm />, { criticalConfig: true })} />
              <Route path="settings/inboxes" element={g(<SettingsInboxes />, { criticalConfig: true })} />
              <Route path="settings/inboxes/new" element={g(<NewInbox />, { criticalConfig: true })} />
              <Route path="settings/inboxes/:id" element={g(<SettingsInboxDetail />, { criticalConfig: true })} />
              <Route path="settings/account" element={<Navigate to="/settings/trabalho" replace />} />
              <Route path="settings/tags" element={g(<Tags />, { criticalConfig: true })} />
              <Route path="settings/times-de-vendas" element={g(<SalesTeams />, { fullPortfolio: true })} />
              <Route path="settings/campos-contato" element={g(<CamposPage />, { criticalConfig: true })} />
              <Route path="settings/modelos-mensagem" element={g(<MessageTemplates />, { criticalConfig: true })} />
            </Route>
            <Route path="funil" element={g(<Kanban />)} />
            <Route path="funil/automatize" element={g(emMigracao('Automação da régua'), { criticalConfig: true })} />
            <Route path="relatorios" element={g(<Relatorios />, { fullPortfolio: true })} />
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
