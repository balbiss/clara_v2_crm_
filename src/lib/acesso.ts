// Perfis de acesso (Configurações › Perfis de acesso): o servidor manda as permissões já resolvidas
// no login e no /profile (user.access). A tela só consulta — quem barra de verdade é o servidor.
import { readUser } from './hooks'

type U = { role?: string; access?: Record<string, boolean | string> | null } | null | undefined

/**
 * Pode? `key` é uma chave do catálogo (ex.: 'menu.carteira', 'contatos.excluir').
 * 'all' = todo mundo; 'owner' = só diretoria (ex.: a própria tela de perfis).
 */
export function can(key: string, user: U = readUser()): boolean {
  if (!key || key === 'all') return true
  if (user?.role === 'diretoria') return true
  if (key === 'owner') return false
  const a = user?.access
  // usuário salvo antes desta versão: até o /profile recarregar, só o menu aparece
  if (!a) return key.startsWith('menu.')
  const v = a[key]
  return v === true || v === 'todos'
}

/** Escopo de um item "Todas / Só da carteira". */
export const escopo = (key: string, user: U = readUser()): 'todos' | 'carteira' =>
  user?.role === 'diretoria' || user?.access?.[key] === 'todos' ? 'todos' : 'carteira'
