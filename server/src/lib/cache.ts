// Substituto do Rails.cache (Solid Cache) da v1: chave → valor com expiração, em memória.
// Usado para estados curtos (status da caixa, flags anti-eco, travas de job, pausa da IA).
const store = new Map<string, { value: unknown; expiresAt: number | null }>();

export const cache = {
  read<T = unknown>(key: string): T | undefined {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt < Date.now()) { store.delete(key); return undefined; }
    return e.value as T;
  },
  write(key: string, value: unknown, expiresInSeconds?: number) {
    store.set(key, { value, expiresAt: expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null });
  },
  exist(key: string) { return this.read(key) !== undefined; },
  delete(key: string) { store.delete(key); },
};

// limpeza periódica pra não acumular chaves expiradas
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of store) if (e.expiresAt !== null && e.expiresAt < now) store.delete(k);
}, 10 * 60 * 1000).unref();
