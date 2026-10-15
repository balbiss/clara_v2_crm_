/** Áudio do assistente: microfone → PCM16 16 kHz (o que o Gemini Live ouve) e
 *  PCM16 24 kHz → alto-falante (a voz dele), com fila e corte imediato quando o usuário interrompe. */

// Processador do microfone (AudioWorklet) embutido: junta ~100 ms e devolve Float32.
const WORKLET = `
class Captura extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) { this.buf.push(new Float32Array(ch)); this.n += ch.length; }
    if (this.n >= 1600) {
      const out = new Float32Array(this.n); let o = 0;
      for (const b of this.buf) { out.set(b, o); o += b.length; }
      this.buf = []; this.n = 0;
      this.port.postMessage(out, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('captura-assistente', Captura);
`;

function paraBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Liga o microfone. `onPedaco` recebe o áudio em base64 (PCM16 16 kHz) e o nível (0–1) pra animar o orbe. */
export async function ligarMicrofone(onPedaco: (base64: string, nivel: number) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const fonte = ctx.createMediaStreamSource(stream);
  const no = new AudioWorkletNode(ctx, 'captura-assistente');
  let mudo = false;
  no.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const f = e.data;
    const pcm = new Int16Array(f.length);
    let soma = 0;
    for (let i = 0; i < f.length; i++) {
      const v = Math.max(-1, Math.min(1, f[i]));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      soma += v * v;
    }
    if (!mudo) onPedaco(paraBase64(new Uint8Array(pcm.buffer)), Math.min(1, Math.sqrt(soma / f.length) * 4));
  };
  fonte.connect(no);
  return {
    setMudo(v: boolean) { mudo = v; },
    async parar() {
      no.port.onmessage = null;
      fonte.disconnect(); no.disconnect();
      stream.getTracks().forEach(t => t.stop());
      await ctx.close().catch(() => {});
    },
  };
}

/** Toca a voz do assistente (PCM16 24 kHz em base64), em fila, sem buracos. */
export function criarAltoFalante(onNivel: (nivel: number) => void) {
  const ctx = new AudioContext({ sampleRate: 24000 });
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 256;
  analisador.connect(ctx.destination);
  let proximo = 0;
  const tocando = new Set<AudioBufferSourceNode>();
  const dados = new Uint8Array(analisador.frequencyBinCount);
  let raf = 0;
  const medir = () => {
    analisador.getByteTimeDomainData(dados);
    let soma = 0;
    for (const d of dados) { const v = (d - 128) / 128; soma += v * v; }
    onNivel(tocando.size ? Math.min(1, Math.sqrt(soma / dados.length) * 5) : 0);
    raf = requestAnimationFrame(medir);
  };
  raf = requestAnimationFrame(medir);
  return {
    tocar(base64: string) {
      if (ctx.state === 'suspended') void ctx.resume();
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      const buf = ctx.createBuffer(1, pcm.length, 24000);
      const canal = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) canal[i] = pcm[i] / 0x8000;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(analisador);
      proximo = Math.max(proximo, ctx.currentTime + 0.03);
      src.start(proximo);
      proximo += buf.duration;
      tocando.add(src);
      src.onended = () => tocando.delete(src);
    },
    /** O usuário começou a falar por cima: corta na hora. */
    interromper() {
      for (const s of tocando) { try { s.stop(); } catch { /* já parou */ } }
      tocando.clear();
      proximo = 0;
    },
    falando: () => tocando.size > 0,
    async fechar() { cancelAnimationFrame(raf); this.interromper(); await ctx.close().catch(() => {}); },
  };
}
