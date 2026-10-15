import { create } from 'zustand';

/** Estado da tela do assistente de voz (separado da store principal). */

export type Painel = { id: string; titulo: string; conteudo: string; x: number; y: number };
export type AcaoPendente =
  | { tipo: 'tarefa'; resumo: string; titulo: string; quando: string; leadId?: string; descricao?: string }
  | { tipo: 'mover'; resumo: string; leadId: string; colunaId: string }
  | { tipo: 'mensagem'; resumo: string; leadId: string; texto: string }
  | { tipo: 'config'; resumo: string; executar: () => Promise<Record<string, unknown>> };
export type ConfigAssistente = { disponivel: boolean; liberado: boolean; nome: string; voz: string; vozes: string[]; minutosMes: number; minutosUsados: number };
export type Fala = { id: number; quem: 'voce' | 'assistente' | 'sistema'; texto: string; antiga?: boolean };

type Estado = {
  config: ConfigAssistente | null;
  aberto: boolean;
  status: 'desligado' | 'conectando' | 'online' | 'erro';
  erro: string | null;
  falas: Fala[];
  paineis: Painel[];
  pendente: AcaoPendente | null;
  /** Ação que alguém confirmou pela tela (clique/joinha) — o painel executa e avisa a IA. */
  confirmarPelaTela: number;
  abrir: () => void;
  fechar: () => void;
  set: (p: Partial<Estado>) => void;
  falar: (quem: Fala['quem'], texto: string, juntar?: boolean) => void;
  abrirPainel: (titulo: string, conteudo: string) => void;
  fecharPainel: (id: string) => void;
  moverPainel: (id: string, x: number, y: number) => void;
};

let seq = 0;
export const useAssistente = create<Estado>((set, get) => ({
  config: null,
  aberto: false,
  status: 'desligado',
  erro: null,
  falas: [],
  paineis: [],
  pendente: null,
  confirmarPelaTela: 0,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
  set: p => set(p),
  falar: (quem, texto, juntar = true) => {
    const falas = get().falas;
    const ultima = falas[falas.length - 1];
    // a transcrição chega em pedaços: junta na mesma fala enquanto for a mesma pessoa
    if (juntar && ultima && ultima.quem === quem) {
      set({ falas: [...falas.slice(0, -1), { ...ultima, texto: ultima.texto + texto }] });
    } else {
      set({ falas: [...falas.slice(-60), { id: ++seq, quem, texto: texto.trimStart() }] });
    }
  },
  abrirPainel: (titulo, conteudo) => {
    const n = get().paineis.length;
    const largura = typeof window !== 'undefined' ? window.innerWidth : 1200;
    set({ paineis: [...get().paineis.slice(-4), { id: 'p' + ++seq, titulo, conteudo, x: Math.max(16, largura / 2 - 360 + n * 28), y: 90 + n * 28 }] });
  },
  fecharPainel: id => set({ paineis: get().paineis.filter(p => p.id !== id) }),
  moverPainel: (id, x, y) => set({ paineis: get().paineis.map(p => (p.id === id ? { ...p, x, y } : p)) }),
}));
