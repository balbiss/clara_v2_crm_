import { useCallback, useEffect, useState } from 'react';
import { UserPlus, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { apiFetch } from '../lib/api';

export type ContatoPendente = {
  id: string;
  telefone: string;
  nome: string | null;
  qtdMensagens: number;
  ultimaMensagemEm: string;
};

type ContatoIgnorado = { id: string; telefone: string; nome: string | null };

const formatarTel = (t: string) => {
  const d = t.replace(/\D/g, '');
  const s = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  const m = s.match(/^(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t;
};

/** Contatos do WhatsApp PESSOAL do corretor que ainda não são lead. Só ele vê. */
export function useContatosWhatsapp() {
  const token = useAppStore(s => s.token);
  const [espelho, setEspelho] = useState(false);
  const [pendentes, setPendentes] = useState<ContatoPendente[]>([]);

  const recarregar = useCallback(() => {
    apiFetch<{ espelho: boolean; pendentes: ContatoPendente[] }>('/api/contatos-whatsapp/pendentes', token)
      .then(r => { setEspelho(r.espelho); setPendentes(r.pendentes); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    recarregar();
    const t = setInterval(recarregar, 20000);
    return () => clearInterval(t);
  }, [recarregar]);

  return { espelho, pendentes, recarregar };
}

export function ContatosPendentes({ espelho, pendentes, recarregar }: ReturnType<typeof useContatosWhatsapp>) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const ask = useAppStore(s => s.ask);
  const [aberto, setAberto] = useState(true);
  const [verIgnorados, setVerIgnorados] = useState(false);
  const [ignorados, setIgnorados] = useState<ContatoIgnorado[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregarIgnorados = () => {
    apiFetch<ContatoIgnorado[]>('/api/contatos-whatsapp/ignorados', token).then(setIgnorados).catch(() => {});
  };

  if (!espelho) return null;

  const trazer = async (c: ContatoPendente) => {
    setOcupado(c.id);
    try {
      await apiFetch('/api/contatos-whatsapp/pendentes/' + c.id + '/trazer', token, { method: 'POST' });
      toast((c.nome || formatarTel(c.telefone)) + ' agora é lead seu no CRM');
      recarregar();
    } catch (e) {
      toast((e as Error).message || 'Não foi possível trazer o contato');
    } finally {
      setOcupado(null);
    }
  };

  const pessoal = (c: ContatoPendente) => {
    ask(
      'Marcar ' + (c.nome || formatarTel(c.telefone)) + ' como pessoal?',
      'Esse número nunca mais aparece no CRM. Dá pra desfazer depois em "Números pessoais".',
      'É pessoal',
      async () => {
        setOcupado(c.id);
        try {
          await apiFetch('/api/contatos-whatsapp/pendentes/' + c.id + '/pessoal', token, { method: 'POST' });
          recarregar();
          if (verIgnorados) carregarIgnorados();
        } catch (e) {
          toast((e as Error).message || 'Não foi possível marcar como pessoal');
        } finally {
          setOcupado(null);
        }
      },
    );
  };

  const desfazer = async (i: ContatoIgnorado) => {
    try {
      await apiFetch('/api/contatos-whatsapp/ignorados/' + i.id, token, { method: 'DELETE' });
      carregarIgnorados();
      toast('Pronto — a próxima mensagem desse número volta a aparecer em "Contatos novos"');
    } catch (e) {
      toast((e as Error).message || 'Não foi possível desfazer');
    }
  };

  const btn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' } as const;

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left' }}
      >
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>
          Contatos novos no seu WhatsApp
          {pendentes.length > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 9, background: 'var(--terra)', color: '#fff', fontSize: 10.5 }}>{pendentes.length}</span>
          )}
        </span>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {aberto && (
        <div style={{ padding: '0 12px 10px' }}>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 4px 8px', lineHeight: 1.5 }}>
            Quem não é lead não entra no CRM sozinho. Só você vê esta lista — o gestor não.
          </p>
          {pendentes.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 4px 6px' }}>Nenhum contato novo.</p>
          )}
          {pendentes.map(c => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '9px 10px', marginBottom: 6, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', opacity: ocupado === c.id ? 0.5 : 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {c.nome || formatarTel(c.telefone)}
                <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--muted)', marginLeft: 6 }}>
                  {c.nome ? formatarTel(c.telefone) + ' · ' : ''}{c.qtdMensagens} {c.qtdMensagens === 1 ? 'mensagem' : 'mensagens'}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" disabled={!!ocupado} onClick={() => trazer(c)} style={{ ...btn, border: 'none', background: 'var(--terra)', color: '#fff' }}>
                  <UserPlus size={13} /> Trazer pro CRM
                </button>
                <button type="button" disabled={!!ocupado} onClick={() => pessoal(c)} style={{ ...btn, border: '1px solid var(--line)', background: 'none', color: 'var(--ink)' }}>
                  <EyeOff size={13} /> É pessoal
                </button>
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => { const v = !verIgnorados; setVerIgnorados(v); if (v) carregarIgnorados(); }}
            style={{ border: 'none', background: 'none', padding: '2px 4px', fontSize: 11.5, color: 'var(--muted)', textDecoration: 'underline' }}
          >
            {verIgnorados ? 'Esconder números pessoais' : 'Números pessoais'}
          </button>
          {verIgnorados && (
            <div style={{ marginTop: 6 }}>
              {ignorados.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 4px' }}>Nenhum número marcado como pessoal.</p>}
              {ignorados.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', fontSize: 12 }}>
                  <span style={{ flex: 1 }}>{i.nome || formatarTel(i.telefone)}</span>
                  <button type="button" onClick={() => desfazer(i)} style={{ border: 'none', background: 'none', fontSize: 11.5, color: 'var(--terra)', fontWeight: 600 }}>Desfazer</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
