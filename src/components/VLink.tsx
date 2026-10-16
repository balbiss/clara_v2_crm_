import { Link, useLocation } from 'react-router-dom'
import type { ReactNode, MouseEventHandler } from 'react'

// <router-link> da v1: aplica router-link-active / router-link-exact-active (classes que o CSS
// da Clara usa) e os active-class/exact-active-class personalizados. Como todas as telas são
// rotas irmãs, "ativo" = mesmo caminho.
export function VLink({ to, className = '', activeClass, exactActiveClass, children, title, onClick }: {
  to: string; className?: string; activeClass?: string; exactActiveClass?: string; children: ReactNode; title?: string; onClick?: MouseEventHandler
}) {
  const { pathname } = useLocation()
  const target = to.split('?')[0].replace(/\/$/, '') || '/'
  const current = pathname.replace(/\/$/, '') || '/'
  const active = current === target
  const cls = [className, active && (activeClass ?? 'router-link-active'), active && (exactActiveClass ?? 'router-link-exact-active')].filter(Boolean).join(' ')
  return <Link to={to} className={cls} title={title} onClick={onClick}>{children}</Link>
}
