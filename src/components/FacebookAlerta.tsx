import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useRoleInfo } from '../lib/selectors';

/** Faixa vermelha no topo (só Dono/Gerente) quando uma página conectada pelo "Conectar com
 *  Facebook" parou de mandar leads — o servidor confere sozinho a cada 6 h. */
export function FacebookAlerta() {
  const { isManager } = useRoleInfo();
  const conexoes = useAppStore(s => s.integracoesFacebook);
  const fetchIntegracoes = useAppStore(s => s.fetchIntegracoes);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isManager) return;
    const t = setInterval(() => fetchIntegracoes(), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [isManager, fetchIntegracoes]);

  if (!isManager) return null;
  const caidas = conexoes.filter(c => c.ativo && c.origem === 'oauth' && c.ultimoErro);
  if (!caidas.length) return null;

  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 34px', background: 'var(--terraSoft)', borderBottom: '1px solid var(--terra)', color: 'var(--ink)' }}>
      <span style={{ fontWeight: 700, color: 'var(--terra)' }}>⚠</span>
      <span style={{ flex: 1, minWidth: 220, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Os leads do Facebook pararam de chegar</strong> da página {caidas.map(c => '"' + c.nomeConta + '"').join(', ')}.
        Clique em Reconectar e faça o login com Facebook de novo.
      </span>
      <button onClick={() => navigate('/integracoes')} style={{ padding: '7px 14px', border: 'none', borderRadius: 7, background: 'var(--terra)', color: '#fff', fontSize: 12.5, fontWeight: 600, flex: 'none' }}>
        Reconectar
      </button>
    </div>
  );
}
