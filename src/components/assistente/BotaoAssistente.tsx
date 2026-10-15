import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { apiFetch } from '../../lib/api';
import { useAssistente, type ConfigAssistente } from '../../lib/assistente/estado';

/** Botão do assistente de voz no topo (só aparece se a imobiliária tem o assistente liberado). */
export function BotaoAssistente() {
  const token = useAppStore(s => s.token);
  const config = useAssistente(s => s.config);
  const aberto = useAssistente(s => s.aberto);
  const status = useAssistente(s => s.status);
  useEffect(() => {
    if (!token) return;
    apiFetch<ConfigAssistente>('/api/assistente/config', token).then(c => useAssistente.getState().set({ config: c })).catch(() => {});
  }, [token]);
  if (!config?.disponivel) return null;
  const online = status === 'online';
  return (
    <button
      onClick={() => (aberto ? useAssistente.getState().fechar() : useAssistente.getState().abrir())}
      title={'Falar com ' + config.nome} aria-label={'Falar com ' + config.nome}
      style={{
        position: 'relative', height: 34, padding: '0 12px 0 8px', border: '1px solid ' + (aberto ? 'var(--terra)' : 'var(--line)'), borderRadius: 17,
        background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', fontSize: 12.5, fontWeight: 600,
      }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flex: 'none',
        background: 'radial-gradient(circle at 35% 30%, #a5f3fc, #0ea5e9 45%, #1e3a8a 100%)',
        boxShadow: online ? '0 0 10px #38bdf8' : 'none', animation: online ? 'orbePulso 1.6s ease-in-out infinite' : 'none',
      }} />
      <span className="botao-assistente-nome">{config.nome}</span>
    </button>
  );
}
