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
            <Route path="dashboard" element={g(emMigracao('Início'))} />
            <Route path="carteira" element={g(emMigracao('Minhas Revendedoras'))} />
            <Route path="inativas" element={g(emMigracao('Inativas'))} />
            <Route path="atacado" element={g(emMigracao('Atacado'))} />
            <Route path="pedidos-pendentes" element={g(emMigracao('Pedidos Pendentes'))} />
            <Route path="tarefas" element={g(emMigracao('Tarefas'))} />
            <Route path="gerencial" element={g(emMigracao('Gerencial'), { fullPortfolio: true })} />
            <Route path="atividades" element={g(emMigracao('Atividades'), { criticalConfig: true })} />
            <Route path="conversas" element={g(<Conversas />)} />
            <Route path="conversas/inbox/:inboxId" element={g(<Conversas />)} />
            <Route path="conversas/:filter" element={g(<Conversas />)} />
            <Route path="chat-equipe" element={g(emMigracao('Chat da Equipe'))} />
            <Route path="contatos" element={g(emMigracao('Contatos'))} />
            <Route path="contatos/:id" element={g(emMigracao('Detalhe do contato'))} />
            <Route path="pipelines/todos-leads" element={g(emMigracao('Todos os leads'), { fullPortfolio: true })} />
            <Route path="pipelines/:slug" element={g(emMigracao('Pipeline'), { fullPortfolio: true })} />
            <Route path="pipelines/:slug/automatize" element={g(emMigracao('Automação do pipeline'), { criticalConfig: true })} />
            <Route path="calendario" element={g(emMigracao('Calendário'))} />
            <Route path="automacoes" element={g(<ComingSoon title="Automações" description="Regras automáticas de tarefas e mensagens — ainda não disponível." />, { criticalConfig: true })} />
            <Route path="fluxos" element={g(emMigracao('Fluxos'), { criticalConfig: true })} />
            <Route path="fluxos/novo" element={g(emMigracao('Novo fluxo'), { criticalConfig: true })} />
            <Route path="fluxos/:id" element={g(emMigracao('Construtor de fluxo'), { criticalConfig: true })} />
            <Route path="agentes" element={g(<Agents />, { criticalConfig: true })} />
            <Route path="agentes/novo" element={g(<AgentForm />, { criticalConfig: true })} />
            <Route path="agentes/:id/editar" element={g(<AgentForm />, { criticalConfig: true })} />
            <Route path="settings/inboxes" element={g(<SettingsInboxes />, { criticalConfig: true })} />
            <Route path="settings/inboxes/new" element={g(<NewInbox />, { criticalConfig: true })} />
            <Route path="settings/inboxes/:id" element={g(<SettingsInboxDetail />, { criticalConfig: true })} />
            <Route path="settings/account" element={g(<Account />, { criticalConfig: true })} />
            <Route path="settings/tags" element={g(<Tags />, { criticalConfig: true })} />
            <Route path="settings/times-de-vendas" element={g(<SalesTeams />, { fullPortfolio: true })} />
            <Route path="settings/campos-contato" element={g(<ContactFieldGroups />, { criticalConfig: true })} />
            <Route path="settings/modelos-mensagem" element={g(<MessageTemplates />, { criticalConfig: true })} />
            <Route path="funil" element={g(emMigracao('Consignado'))} />
            <Route path="funil/automatize" element={g(emMigracao('Automação da régua'), { criticalConfig: true })} />
            <Route path="relatorios" element={g(emMigracao('Relatórios'), { fullPortfolio: true })} />
            <Route path="manual" element={g(emMigracao('Manual'))} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)

// novo service worker assumiu (nova versão publicada): recarrega uma vez
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}
