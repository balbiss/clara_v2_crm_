/** Gestos pela webcam (MediaPipe Gesture Recognizer, tudo no navegador — nenhuma imagem sai do PC).
 *  - cursor segue a ponta do indicador (espelhado, com suavização)
 *  - pinça (polegar + indicador) = segurar/arrastar
 *  - punho fechado = fechar o painel debaixo do cursor
 *  - "V" (paz e amor) = liga/desliga o microfone
 *  - joinha = confirmar a ação pendente */

const VERSAO = '1.1.0';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSAO}/wasm`;
const MODELO = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export type Gesto = 'Closed_Fist' | 'Victory' | 'Thumb_Up';
export type Callbacks = {
  cursor: (x: number, y: number, pinca: boolean, visivel: boolean) => void;
  gesto: (g: Gesto) => void;
};

export async function ligarGestos(video: HTMLVideoElement, canvas: HTMLCanvasElement, cb: Callbacks) {
  const { FilesetResolver, GestureRecognizer, DrawingUtils } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const reconhecedor = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELO, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
  video.srcObject = stream;
  await video.play();

  const g = canvas.getContext('2d')!;
  const desenho = new DrawingUtils(g);
  let ultimoTempo = -1;
  let raf = 0;
  let sx = window.innerWidth / 2, sy = window.innerHeight / 2;
  // gesto só dispara depois de segurar ~0,4 s, e de novo só depois de mudar de gesto
  let candidato: string | null = null, desde = 0, disparado: string | null = null;

  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === ultimoTempo) return;
    ultimoTempo = video.currentTime;
    const r = reconhecedor.recognizeForVideo(video, performance.now());
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const mao = r.landmarks?.[0];
    if (!mao) { cb.cursor(sx, sy, false, false); candidato = null; disparado = null; return; }
    desenho.drawConnectors(mao, GestureRecognizer.HAND_CONNECTIONS, { color: '#7dd3fc', lineWidth: 3 });
    desenho.drawLandmarks(mao, { color: '#f97316', radius: 3 });

    const ponta = mao[8], polegar = mao[4];
    // margem: a mão não precisa ir até a borda da câmera pra chegar na borda da tela
    const nx = Math.min(1, Math.max(0, ((1 - ponta.x) - 0.15) / 0.7));
    const ny = Math.min(1, Math.max(0, (ponta.y - 0.15) / 0.7));
    sx += (nx * window.innerWidth - sx) * 0.35;
    sy += (ny * window.innerHeight - sy) * 0.35;
    const pinca = Math.hypot(ponta.x - polegar.x, ponta.y - polegar.y) < 0.05;
    cb.cursor(sx, sy, pinca, true);

    const cat = r.gestures?.[0]?.[0];
    const nome = cat && cat.score > 0.6 ? cat.categoryName : null;
    const agora = performance.now();
    if (nome !== candidato) { candidato = nome; desde = agora; }
    if (nome && nome !== disparado && agora - desde > 400 && (nome === 'Closed_Fist' || nome === 'Victory' || nome === 'Thumb_Up')) {
      disparado = nome;
      cb.gesto(nome);
    }
    if (!nome) disparado = null;
  };
  raf = requestAnimationFrame(loop);

  return {
    parar() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      reconhecedor.close();
    },
  };
}
