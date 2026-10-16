import { useEffect, useRef } from 'react'

/** Diretiva v-click-outside da v1. */
export function useClickOutside<T extends HTMLElement>(handler: (e: MouseEvent) => void, enabled = true) {
  const ref = useRef<T | null>(null)
  const saved = useRef(handler)
  saved.current = handler
  useEffect(() => {
    if (!enabled) return
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) saved.current(e) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [enabled])
  return ref
}

/** window.addEventListener com limpeza (eventos customizados que a v1 usa entre telas). */
export function useWindowEvent<K extends string>(name: K, handler: (e: CustomEvent) => void) {
  const saved = useRef(handler)
  saved.current = handler
  useEffect(() => {
    const fn = (e: Event) => saved.current(e as CustomEvent)
    window.addEventListener(name, fn)
    return () => window.removeEventListener(name, fn)
  }, [name])
}

export const readUser = () => {
  try { return JSON.parse(localStorage.getItem('user') || 'null') || {} } catch { return {} }
}

import { proxy, useSnapshot } from 'valtio'

/**
 * Estado local mutável no estilo dos `ref()` do Vue: devolve [state, snap].
 * Handlers mudam `state.x = ...`; o JSX lê de `snap.x` (re-renderiza sozinho).
 * sync: true evita o cursor pular em <input> controlado.
 */
export function useLocal<T extends object>(init: () => T): [T, T] {
  const ref = useRef<T | null>(null)
  if (!ref.current) ref.current = proxy(init())
  const snap = useSnapshot(ref.current, { sync: true }) as T
  return [ref.current, snap]
}
