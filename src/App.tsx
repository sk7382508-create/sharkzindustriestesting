import React, { useEffect, useRef, useState, useCallback } from 'react';

declare const Hands: any;
declare const FaceMesh: any;
declare const Camera: any;

// ── TYPES ─────────────────────────────────────────────
type ShapeType = 'cube' | 'triangle' | 'star' | 'sphere' | 'diamond';

class Particle {
  x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; open: boolean; color: string;
  constructor(x: number, y: number, open: boolean, color: string, vx: number | null = null, vy: number | null = null) {
    this.x = x; this.y = y;
    this.vx = vx !== null ? vx : (Math.random() - 0.5) * 3;
    this.vy = vy !== null ? vy : (Math.random() - 0.5) * 3;
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
    this.size = 1.5 + Math.random() * 2.5;
    this.open = open;
    this.color = color;
  }
  update() { this.x += this.vx; this.y += this.vy; this.life -= this.decay; }
  draw(ctx: CanvasRenderingContext2D) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life * (this.open ? 0.9 : 0.4);
    ctx.shadowBlur = this.open ? 12 : 4;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

type HologramBlock = {
  x: number; y: number; w: number; h: number; id: number;
  crushProgress: number; color: string; shape: ShapeType;
  hue: number; wobble: number; spinAngle: number;
  scale: number; // zoom scale
  alpha: number; dying: boolean;
};

function normDist(a: any, b: any) { return Math.hypot(a.x - b.x, a.y - b.y); }

function isPinching(landmarks: any) {
  const dx = landmarks[4].x - landmarks[8].x;
  const dy = landmarks[4].y - landmarks[8].y;
  const dz = landmarks[4].z - landmarks[8].z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.06;
}

function isOpenPalm(landmarks: any) {
  const tips = [8, 12, 16, 20];
  const bases = [5, 9, 13, 17];
  let extended = 0;
  for (let i = 0; i < 4; i++) {
    const t = landmarks[tips[i]], b = landmarks[bases[i]], wrist = landmarks[0];
    const dt = Math.hypot(t.x - wrist.x, t.y - wrist.y, t.z - wrist.z);
    const db = Math.hypot(b.x - wrist.x, b.y - wrist.y, b.z - wrist.z);
    if (dt > db * 1.1) extended++;
  }
  return extended >= 3;
}

function isFist(landmarks: any) {
  const tips = [8, 12, 16, 20];
  const bases = [5, 9, 13, 17];
  let folded = 0;
  for (let i = 0; i < 4; i++) {
    const t = landmarks[tips[i]], b = landmarks[bases[i]], wrist = landmarks[0];
    const dt = Math.hypot(t.x - wrist.x, t.y - wrist.y, t.z - wrist.z);
    const db = Math.hypot(b.x - wrist.x, b.y - wrist.y, b.z - wrist.z);
    if (dt < db * 1.3) folded++;
  }
  return folded >= 3;
}

// Shape hue ranges
function getShapeHue(shape: ShapeType): number {
  const hues: Record<ShapeType, [number, number]> = {
    cube: [180, 60], triangle: [280, 40], star: [40, 30],
    sphere: [140, 40], diamond: [300, 40]
  };
  const [base, range] = hues[shape] || [180, 60];
  return base + Math.random() * range;
}

// ── SHAPE DRAWING (FLAT 2D, DARK & SOLID) ─────────────
function drawShapeBlock(ctx: CanvasRenderingContext2D, b: HologramBlock) {
  const s = 40 * b.scale;
  const hue = b.hue;

  ctx.shadowBlur = 14;
  ctx.shadowColor = `hsl(${hue}, 80%, 40%)`;

  // Dark solid fill + bright border — flat 2D
  ctx.fillStyle = `hsla(${hue}, 70%, 18%, 0.85)`;
  ctx.strokeStyle = `hsla(${hue}, 90%, 55%, 0.95)`;
  ctx.lineWidth = 2;

  switch (b.shape) {
    case 'cube': {
      // Flat square
      ctx.beginPath();
      ctx.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      ctx.fill(); ctx.stroke();
      // Inner cross lines
      ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0);
      ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7);
      ctx.stroke();
      break;
    }
    case 'triangle': {
      const h = s * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.55);
      ctx.lineTo(-s * 0.65, h * 0.4);
      ctx.lineTo(s * 0.65, h * 0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Inner triangle
      ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.2);
      ctx.lineTo(-s * 0.3, h * 0.2);
      ctx.lineTo(s * 0.3, h * 0.2);
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'star': {
      const spikes = 5, outerR = s * 0.75, innerR = s * 0.32;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI / spikes) - Math.PI / 2 + b.spinAngle * 0.3;
        const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Center dot
      ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.6)`;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'sphere': {
      // Flat circle
      const r = s * 0.65;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Cross line
      ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      break;
    }
    case 'diamond': {
      const dh = s * 0.85, dw = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -dh); ctx.lineTo(dw, 0);
      ctx.lineTo(0, dh); ctx.lineTo(-dw, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Center horizontal line
      ctx.strokeStyle = `hsla(${hue}, 80%, 45%, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-dw, 0); ctx.lineTo(dw, 0); ctx.stroke();
      break;
    }
  }
}

// ── GHOST BLOCK DRAW ──────────────────────────────────
function drawGhostShape(ctx: CanvasRenderingContext2D, shape: ShapeType, scale: number) {
  const s = 40 * scale;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1;
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#00e5ff';
  ctx.setLineDash([4, 4]);
  switch (shape) {
    case 'cube': {
      const isoX = s * 0.86, isoY = s * 0.5;
      ctx.beginPath(); ctx.moveTo(0, -isoY); ctx.lineTo(isoX, 0); ctx.lineTo(0, isoY); ctx.lineTo(-isoX, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-isoX, 0); ctx.lineTo(0, isoY); ctx.lineTo(0, isoY + s * 0.6); ctx.lineTo(-isoX, s * 0.6); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(isoX, 0); ctx.lineTo(0, isoY); ctx.lineTo(0, isoY + s * 0.6); ctx.lineTo(isoX, s * 0.6); ctx.closePath(); ctx.stroke();
      break;
    }
    case 'triangle': {
      const h = s * 1.2;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.lineTo(-s * 0.6, h * 0.35); ctx.lineTo(s * 0.6, h * 0.35); ctx.closePath(); ctx.stroke();
      break;
    }
    case 'star': {
      const spikes = 5, outerR = s * 0.7, innerR = s * 0.3;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI / spikes) - Math.PI / 2;
        const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'sphere': {
      const r = s * 0.55;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'diamond': {
      const topH = s * 0.7, botH = s * 0.45, w = s * 0.55;
      ctx.beginPath(); ctx.moveTo(0, -topH); ctx.lineTo(w, 0); ctx.lineTo(0, botH); ctx.lineTo(-w, 0); ctx.closePath(); ctx.stroke();
      break;
    }
  }
  ctx.setLineDash([]);
  // "+" icon
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
}

// ── TWO-HAND GESTURE DETECTION ────────────────────────
function detectTwoHandGestures(hands: any[], lm: (lms: any, i: number) => { x: number; y: number }) {
  if (hands.length < 2) return null;
  const h1 = hands[0], h2 = hands[1];
  const h1Thumb = lm(h1, 4), h1Index = lm(h1, 8);
  const h2Thumb = lm(h2, 4), h2Index = lm(h2, 8);
  const thumbDist = Math.hypot(h1Thumb.x - h2Thumb.x, h1Thumb.y - h2Thumb.y);
  const indexDist = Math.hypot(h1Index.x - h2Index.x, h1Index.y - h2Index.y);

  // Triangle: thumbs + index fingers touching
  if (thumbDist < 60 && indexDist < 60) {
    const cx = (h1Thumb.x + h2Thumb.x + h1Index.x + h2Index.x) / 4;
    const cy = (h1Thumb.y + h2Thumb.y + h1Index.y + h2Index.y) / 4;
    return { gesture: 'TRIANGLE' as const, x: cx, y: cy, palmDist: 0 };
  }

  // X-Cross: wrists crossed, hands opposite
  const h1Wrist = lm(h1, 0), h2Wrist = lm(h2, 0);
  const h1Mid = lm(h1, 9), h2Mid = lm(h2, 9);
  const wristDist = Math.hypot(h1Wrist.x - h2Wrist.x, h1Wrist.y - h2Wrist.y);
  const h1Dir = h1Mid.x - h1Wrist.x;
  const h2Dir = h2Mid.x - h2Wrist.x;
  if (wristDist < 100 && h1Dir * h2Dir < 0) {
    const cx = (h1Wrist.x + h2Wrist.x) / 2;
    const cy = (h1Wrist.y + h2Wrist.y) / 2;
    return { gesture: 'X_CROSS' as const, x: cx, y: cy, palmDist: 0 };
  }

  // ZOOM: both hands pinching — pinch-to-zoom like a photo
  const bothPinching = isPinching(h1) && isPinching(h2);
  if (bothPinching) {
    // Use the pinch center (midpoint of thumb+index) for each hand
    const p1 = { x: (lm(h1, 4).x + lm(h1, 8).x) / 2, y: (lm(h1, 4).y + lm(h1, 8).y) / 2 };
    const p2 = { x: (lm(h2, 4).x + lm(h2, 8).x) / 2, y: (lm(h2, 4).y + lm(h2, 8).y) / 2 };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    return { gesture: 'ZOOM' as const, x: cx, y: cy, palmDist: dist, p1, p2 };
  }

  return null;
}

// ── MAIN COMPONENT ────────────────────────────────────
export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blocksRef = useRef<HologramBlock[]>([]);

  // Touch pinch-to-zoom (two fingers, one hand)
  const touchPtsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const touchZoomRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    blockId: number | null;
  }>({ active: false, startDist: 0, startScale: 1, blockId: null });

  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState('INITIALIZING SENSOR ARRAY...');
  const [currentShape, setCurrentShape] = useState<ShapeType>('cube');
  const [zoomDisplay, setZoomDisplay] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [modeText, setModeText] = useState('MODE: SCANNING');
  const [gestureText, setGestureText] = useState('GESTURE: —');
  const [expressionText, setExpressionText] = useState('EXPRESSION: SCANNING...');
  const [blockCount, setBlockCount] = useState(0);
  const [handCount, setHandCount] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);

  const currentShapeRef = useRef<ShapeType>('cube');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { currentShapeRef.current = currentShape; }, [currentShape]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const shapes: { key: ShapeType; icon: string; label: string }[] = [
    { key: 'cube', icon: '🔷', label: 'CUBE' },
    { key: 'triangle', icon: '🔺', label: 'TRIANGLE' },
    { key: 'star', icon: '⭐', label: 'STAR' },
    { key: 'sphere', icon: '🔵', label: 'SPHERE' },
    { key: 'diamond', icon: '💎', label: 'DIAMOND' },
  ];

  const getEvtPoint = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getDist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const getMid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const findNearestBlockId = (x: number, y: number) => {
    let best = { d: Infinity, id: null as number | null, scale: 1 };
    for (const b of blocksRef.current) {
      if (b.dying) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < best.d) best = { d, id: b.id, scale: b.scale };
    }
    // ignore if far away
    if (best.d > 220) return { id: null as number | null, scale: 1 };
    return { id: best.id, scale: best.scale };
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !window.Hands || !window.FaceMesh) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    const handleResize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; };
    window.addEventListener('resize', handleResize);

    let hands: any[] = [];
    let faceData: any = null;
    let particles: Particle[] = [];
    blocksRef.current = [];
    let draggingBlock: HologramBlock | null = null;
    let pinchHoldFrames = 0;
    let blockIdCounter = 0;
    let globalAngle = 0;

    let triangleCooldown = 0;
    let xCrossCooldown = 0;
    let zoomStartDist = 0;  // initial palm distance when zoom gesture begins
    let zoomStartScale = 1; // initial block scale when zoom gesture begins
    let zoomBlock: HologramBlock | null = null; // block being zoomed
    let wasZooming = false; // was zoom active last frame

    const lm = (lms: any, i: number) => ({ x: (1 - lms[i].x) * W, y: lms[i].y * H });
    const palmCenter = (lms: any) => {
      const p = [0, 5, 9, 13, 17].map(i => lm(lms, i));
      return { x: p.reduce((a, b) => a + b.x, 0) / 5, y: p.reduce((a, b) => a + b.y, 0) / 5 };
    };
    const getPinchCenter = (lms: any) => { const t = lm(lms, 4), i = lm(lms, 8); return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 }; };

    // Face mesh
    const faces = new window.FaceMesh({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
    faces.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
    faces.onResults((res: any) => {
      if (!res.multiFaceLandmarks || res.multiFaceLandmarks.length === 0) {
        faceData = null; setFaceDetected(false);
        setExpressionText('EXPRESSION: SCANNING...');
        return;
      }
      setFaceDetected(true);
      const lms = res.multiFaceLandmarks[0];
      const getFlm = (i: number) => ({ x: (1 - lms[i].x) * W, y: lms[i].y * H });

      const faceW = Math.max(1, normDist(lms[234], lms[454]));
      const furrowRatio = normDist(lms[107], lms[336]) / faceW;
      const mouthWidth = normDist(lms[61], lms[291]);
      const mouthOpen = normDist(lms[13], lms[14]);
      const mouthRatio = mouthWidth > 0 ? mouthOpen / mouthWidth : 0;
      const frownScore = ((lms[61].y + lms[291].y) / 2) - ((lms[13].y + lms[14].y) / 2);

      const leftEAR = normDist(lms[159], lms[145]) / Math.max(0.001, normDist(lms[33], lms[133]));
      const rightEAR = normDist(lms[386], lms[374]) / Math.max(0.001, normDist(lms[362], lms[263]));
      const leftEyeOpen = Math.min(100, Math.max(0, leftEAR * 300));
      const rightEyeOpen = Math.min(100, Math.max(0, rightEAR * 300));
      const avgEye = (leftEyeOpen + rightEyeOpen) / 2;

      const browDist = (normDist(lms[70], lms[159]) + normDist(lms[300], lms[386])) / 2;
      const browRatio = browDist / Math.max(0.001, normDist(lms[1], lms[152]));

      // Smirk detection
      const smirkAsym = Math.abs(lms[61].y - lms[291].y);
      const smirkVal = normDist(lms[1], lms[152]) > 0 ? smirkAsym / normDist(lms[1], lms[152]) : 0;

      const isAngry = furrowRatio < 0.28 && frownScore > -0.01;
      const isSad = frownScore > 0.015;
      const eyeSquint = leftEyeOpen < 25 && rightEyeOpen < 25;
      const isCrying = isSad && eyeSquint;
      const mouthVal = mouthRatio * 200;
      const smileVal = frownScore < -0.015;

      let expr = 'NEUTRAL 😐';
      if (isCrying) expr = 'CRYING 😭';
      else if (isAngry && mouthVal < 15) expr = 'FRUSTRATED 😤';
      else if (isAngry) expr = 'ANGRY 😠';
      else if (isSad && avgEye < 55 && smileVal === false) expr = 'ANNOYED 😒';
      else if (isSad) expr = 'SAD 😢';
      else if (smileVal && mouthVal > 40) expr = 'LAUGHING 😆';
      else if (smileVal && smirkVal > 0.02) expr = 'SMIRKING 😏';
      else if (smileVal) expr = 'HAPPY 😊';
      else if (browRatio > 0.15 && mouthVal > 50 && avgEye > 70) expr = 'SHOCKED 😮';
      else if (browRatio > 0.15 && mouthVal > 30) expr = 'SURPRISED 😲';
      else if (avgEye < 18 && mouthVal < 15) expr = 'SLEEPY 😴';
      else if (avgEye < 12) expr = 'EYES CLOSED 😌';
      else if ((leftEyeOpen < 15) !== (rightEyeOpen < 15)) expr = 'WINKING 😜';
      else if (mouthVal > 50) expr = 'MOUTH OPEN 😮';
      else if (browRatio > 0.15) expr = 'BROW RAISED 🤨';

      const nose = getFlm(1); const chin = getFlm(152);
      faceData = {
        lms, expr,
        center: { x: (getFlm(10).x + chin.x) / 2, y: (getFlm(10).y + chin.y) / 2 },
        radius: Math.hypot(getFlm(10).x - chin.x, getFlm(10).y - chin.y) / 2,
        isAngry, isCrying,
        exColor: '#33ffaa'
      };

      // Color by expression
      if (expr.includes('ANGRY') || expr.includes('FRUSTRATED')) faceData.exColor = '#ff4466';
      else if (expr.includes('SAD') || expr.includes('CRYING')) faceData.exColor = '#5599ff';
      else if (expr.includes('HAPPY') || expr.includes('LAUGHING')) faceData.exColor = '#ffe044';
      else if (expr.includes('SURPRISED') || expr.includes('SHOCKED')) faceData.exColor = '#ffaa33';
      else if (expr.includes('ANNOYED')) faceData.exColor = '#ff9966';
      else if (expr.includes('SMIRKING')) faceData.exColor = '#bb77ff';
      else if (expr.includes('SLEEPY') || expr.includes('WINKING')) faceData.exColor = '#77ddff';

      setExpressionText(`${expr}`);
    });

    // Hands model
    const handsModel = new window.Hands({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    handsModel.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
    handsModel.onResults((res: any) => {
      hands = res.multiHandLandmarks || [];
      setHandCount(hands.length);
    });

    const camera = new window.Camera(video, {
      onFrame: async () => { await handsModel.send({ image: video }); await faces.send({ image: video }); },
      width: 1280, height: 720
    });

    // Boot sequence
    const lines = [
      'INITIALIZING SENSOR ARRAY...',
      'LOADING MEDIAPIPE MODELS...',
      'LOADING SHAPE BLOCK ENGINE...',
      'CALIBRATING EXPRESSION ANALYZER...',
      'CALIBRATING HUD OVERLAY...',
      'SHARKZ SYSTEM ONLINE — WELCOME, DIRECTOR'
    ];
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < lines.length) setLoadStatus(lines[idx++]);
      else clearInterval(interval);
    }, 450);

    camera.start().then(() => { setTimeout(() => setLoading(false), 3000); });

    // ── MAIN RENDER LOOP ──────────────────────────────
    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      globalAngle += 0.015;
      if (triangleCooldown > 0) triangleCooldown--;
      if (xCrossCooldown > 0) xCrossCooldown--;

      let anyPinch = false;

      // Two-hand gestures
      const twoHand = detectTwoHandGestures(hands, lm);
      if (twoHand) {
        if (twoHand.gesture === 'TRIANGLE') {
          // Draw triangle visual
          ctx.save(); ctx.translate(twoHand.x, twoHand.y);
          const pulse = Math.sin(performance.now() * 0.008) * 0.15 + 0.85;
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#bb77ff'; ctx.shadowBlur = 30; ctx.shadowColor = '#bb77ff'; ctx.lineWidth = 3;
          const ts = 50;
          ctx.beginPath(); ctx.moveTo(0, -ts); ctx.lineTo(-ts * 0.866, ts * 0.5); ctx.lineTo(ts * 0.866, ts * 0.5); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = 'rgba(187,119,255,0.15)'; ctx.fill();
          ctx.restore();

          setGestureText('GESTURE: △ TRIANGLE');
          setModeText('MODE: TRIANGLE BUILD 🔺');

          if (triangleCooldown <= 0) {
            const nb: HologramBlock = {
              x: twoHand.x - 40, y: twoHand.y - 40, w: 80, h: 80,
              id: blockIdCounter++, crushProgress: 0, color: '#bb77ff',
              shape: 'triangle', hue: getShapeHue('triangle'),
              wobble: Math.random() * Math.PI * 2, spinAngle: Math.random() * Math.PI * 2,
              scale: 1.0, alpha: 0, dying: false
            };
            blocksRef.current.push(nb);
            triangleCooldown = 30;
            for (let i = 0; i < 18; i++) particles.push(new Particle(twoHand.x, twoHand.y, true, `hsl(${280 + Math.random() * 40}, 100%, 70%)`));
          }
        } else if (twoHand.gesture === 'X_CROSS') {
          // Keep the gesture action, but do not draw an on-screen X mark
          setGestureText('GESTURE: X-CROSS');
          setModeText('MODE: DESTROY ALL');

          if (xCrossCooldown <= 0 && blocksRef.current.length > 0) {
            for (const b of blocksRef.current) {
              b.dying = true;
              for (let i = 0; i < 8; i++) particles.push(new Particle(b.x + b.w / 2, b.y + b.h / 2, true, '#ff4466'));
            }
            xCrossCooldown = 60;
          }
        }
      } else if (twoHand && (twoHand as any).gesture === 'ZOOM') {
        // ── HAND ZOOM GESTURE ──────────────────────
        const zoomData = twoHand as any;
        const palmDist = zoomData.palmDist;
        const cx = zoomData.x, cy = zoomData.y;

        // Find nearest block to zoom center
        if (!wasZooming) {
          // Starting zoom — lock onto nearest block
          let bestDist = 200, nearest: HologramBlock | null = null;
          for (const b of blocksRef.current) {
            if (b.dying) continue;
            const bx = b.x + b.w / 2, by = b.y + b.h / 2;
            const d = Math.hypot(bx - cx, by - cy);
            if (d < bestDist) { bestDist = d; nearest = b; }
          }
          zoomBlock = nearest;
          zoomStartDist = palmDist;
          zoomStartScale = nearest ? nearest.scale : 1;
        }

        if (zoomBlock && !zoomBlock.dying) {
          // Calculate new scale from how much hands have spread
          const ratio = palmDist / Math.max(zoomStartDist, 1);
          const newScale = Math.max(0.3, Math.min(4.0, zoomStartScale * ratio));
          zoomBlock.scale = newScale;
          zoomBlock.w = 80 * newScale;
          zoomBlock.h = 80 * newScale;
          // Keep block centered while zooming
          const bCx = zoomBlock.x + zoomBlock.w / 2;
          const bCy = zoomBlock.y + zoomBlock.h / 2;

          setGestureText(`GESTURE: 🔍 ZOOM ${newScale.toFixed(1)}x`);
          setModeText(`MODE: ZOOM BLOCK [${newScale.toFixed(1)}x]`);
          setZoomDisplay(`${newScale.toFixed(1)}x`);

          // Draw zoom visual: lines between palms through block
          ctx.save();
          ctx.strokeStyle = '#ffe044'; ctx.lineWidth = 2;
          ctx.shadowBlur = 15; ctx.shadowColor = '#ffe044';
          ctx.globalAlpha = 0.6;
          ctx.setLineDash([6, 8]);
          // Line from palm1 to palm2
          if (zoomData.p1 && zoomData.p2) {
            ctx.beginPath();
            ctx.moveTo(zoomData.p1.x, zoomData.p1.y);
            ctx.lineTo(zoomData.p2.x, zoomData.p2.y);
            ctx.stroke();
          }
          ctx.setLineDash([]);

          // Zoom ring around block
          ctx.strokeStyle = '#ffe044'; ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.4 + Math.sin(performance.now() * 0.006) * 0.15;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.arc(bCx, bCy, Math.max(zoomBlock.w, zoomBlock.h) * 0.8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Scale text
          ctx.font = '700 14px "Orbitron", sans-serif';
          ctx.fillStyle = '#ffe044'; ctx.globalAlpha = 0.9;
          ctx.shadowBlur = 10; ctx.textAlign = 'center';
          ctx.fillText(`${newScale.toFixed(1)}x`, bCx, bCy - Math.max(zoomBlock.w, zoomBlock.h) * 0.8 - 10);

          // Arrows indicating spread/pinch
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#ffe044'; ctx.lineWidth = 2;
          const arrowSize = 8;
          if (zoomData.p1 && zoomData.p2) {
            // Left arrow pointing outward
            const lx = zoomData.p1.x, ly = zoomData.p1.y;
            ctx.beginPath(); ctx.arc(lx, ly, 12, 0, Math.PI * 2); ctx.stroke();
            // Right arrow
            const rx = zoomData.p2.x, ry = zoomData.p2.y;
            ctx.beginPath(); ctx.arc(rx, ry, 12, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();

          // Spawn zoom particles
          if (Math.random() < 0.3) {
            particles.push(new Particle(bCx + (Math.random() - 0.5) * zoomBlock.w, bCy + (Math.random() - 0.5) * zoomBlock.h, true, '#ffe044'));
          }
        } else {
          setGestureText('GESTURE: 🔍 ZOOM (no block)');
          setModeText('MODE: ZOOM — MOVE NEAR BLOCK');
          setZoomDisplay('');
        }

        wasZooming = true;
      }

      // Reset zoom state when not zooming
      if (!twoHand || (twoHand as any).gesture !== 'ZOOM') {
        wasZooming = false;
        zoomBlock = null;
        setZoomDisplay('');
      }

      // Single-hand logic
      for (const h of hands) {
        const pinch = isPinching(h);
        const fist = isFist(h);
        const pt = getPinchCenter(h);
        const palm = palmCenter(h);

        // Delete block (fist crush)
        if (fist && !pinch && !twoHand) {
          setModeText('MODE: DELETE ✕');
          setGestureText('GESTURE: FIST');
          for (let i = blocksRef.current.length - 1; i >= 0; i--) {
            const b = blocksRef.current[i];
            if (b.dying) continue;
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            if (Math.hypot(palm.x - cx, palm.y - cy) < 60 * b.scale) {
              b.crushProgress++;
              if (b.crushProgress > 15) {
                b.dying = true;
                for (let j = 0; j < 20; j++) {
                  particles.push(new Particle(cx, cy, true, Math.random() > 0.5 ? '#00e5ff' : '#ff4466', (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10));
                }
              }
            } else {
              b.crushProgress = 0;
            }
          }
        }
        else if (pinch && !twoHand) {
          anyPinch = true;
          setGestureText('GESTURE: PINCH');
          if (draggingBlock) {
            draggingBlock.x = pt.x - draggingBlock.w / 2;
            draggingBlock.y = pt.y - draggingBlock.h / 2;
            setModeText('MODE: MOVING BLOCK');
          } else {
            const target = blocksRef.current.find(b => !b.dying && pt.x > b.x && pt.x < b.x + b.w && pt.y > b.y && pt.y < b.y + b.h);
            if (target) {
              draggingBlock = target;
            } else {
              pinchHoldFrames++;
              if (pinchHoldFrames > 20) {
                const shape = currentShapeRef.current;
                const sz = 80;
                const nb: HologramBlock = {
                  x: pt.x - sz / 2, y: pt.y - sz / 2, w: sz, h: sz,
                  id: blockIdCounter++, crushProgress: 0,
                  color: '#00e5ff', shape, hue: getShapeHue(shape),
                  wobble: Math.random() * Math.PI * 2, spinAngle: Math.random() * Math.PI * 2,
                  scale: 1.0, alpha: 0, dying: false
                };
                blocksRef.current.push(nb);
                draggingBlock = nb;
                setModeText(`MODE: ${shape.toUpperCase()} PLACED ✓`);
                for (let i = 0; i < 14; i++) particles.push(new Particle(pt.x, pt.y, true, `hsl(${nb.hue + Math.random() * 30}, 100%, 70%)`));
              } else {
                // Ghost preview
                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.globalAlpha = 0.35 + Math.sin(performance.now() * 0.005) * 0.15;
                drawGhostShape(ctx, currentShapeRef.current, 1.0);
                ctx.restore();
                setModeText(`MODE: BUILD [${currentShapeRef.current.toUpperCase()}]`);
              }
            }
          }
        }
        else if (!fist && !pinch && !twoHand) {
          setModeText('MODE: SCANNING');
          setGestureText('GESTURE: —');
        }

        // Skeletal draw
        const conns = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];
        ctx.save(); ctx.lineWidth = 1.2; ctx.shadowBlur = 12; ctx.shadowColor = '#00e5ff';
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        for (const [a, b] of conns) { const p1 = lm(h, a), p2 = lm(h, b); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
        for (let i = 0; i < 21; i++) {
          const p = lm(h, i);
          ctx.fillStyle = 'rgba(0,229,255,0.85)'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        if (!pinch && !fist && Math.random() < 0.2) particles.push(new Particle(palm.x, palm.y, true, '#00e5ff'));
      }

      if (hands.length === 0) {
        setGestureText('GESTURE: —');
        setModeText('MODE: SCANNING');
      }

      if (!anyPinch) { draggingBlock = null; pinchHoldFrames = 0; }

      // Face particles
      if (faceData) {
        if (faceData.isCrying && Math.random() < 0.4) {
          const lEye = { x: (1 - faceData.lms[145].x) * W, y: faceData.lms[145].y * H };
          const rEye = { x: (1 - faceData.lms[374].x) * W, y: faceData.lms[374].y * H };
          particles.push(new Particle(lEye.x, lEye.y, true, '#5599ff', (Math.random() - 0.5) * 0.5, 2 + Math.random() * 3));
          particles.push(new Particle(rEye.x, rEye.y, true, '#5599ff', (Math.random() - 0.5) * 0.5, 2 + Math.random() * 3));
        }
        if (faceData.isAngry && Math.random() < 0.3) {
          const lCheek = { x: (1 - faceData.lms[234].x) * W, y: faceData.lms[234].y * H };
          const rCheek = { x: (1 - faceData.lms[454].x) * W, y: faceData.lms[454].y * H };
          particles.push(new Particle(lCheek.x, lCheek.y, true, '#ff4466', -1 - Math.random(), -1 - Math.random()));
          particles.push(new Particle(rCheek.x, rCheek.y, true, '#ff4466', 1 + Math.random(), -1 - Math.random()));
        }
        // Face scan ring
        ctx.save(); ctx.translate(faceData.center.x, faceData.center.y); ctx.rotate(globalAngle);
        ctx.strokeStyle = faceData.exColor; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.shadowBlur = 14; ctx.shadowColor = faceData.exColor;
        ctx.setLineDash([8, 12]);
        ctx.beginPath(); ctx.arc(0, 0, faceData.radius * 1.3, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Expression label on canvas
        ctx.save();
        ctx.font = '700 13px "Orbitron", sans-serif';
        ctx.fillStyle = faceData.exColor; ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 12; ctx.shadowColor = faceData.exColor;
        ctx.textAlign = 'center';
        ctx.fillText(`◈ ${faceData.expr} ◈`, faceData.center.x, faceData.center.y - faceData.radius * 1.5);
        ctx.restore();
      }

      // Particles
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      particles = particles.filter(p => p.life > 0);
      for (const p of particles) { p.update(); p.draw(ctx); }
      ctx.restore();

      // Draw blocks (shape blocks with zoom)
      blocksRef.current = blocksRef.current.filter(b => !(b.dying && b.alpha <= 0.01));
      for (const b of blocksRef.current) {
        b.wobble += 0.03;
        b.spinAngle += 0.015;
        if (!b.dying && b.alpha < 1) b.alpha = Math.min(1, b.alpha + 0.06);
        if (b.dying) b.alpha -= 0.08;
        if (b.alpha <= 0) continue;

        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;

        ctx.save();
        ctx.globalAlpha = b.alpha * 0.9;

        if (b.crushProgress > 0 && !b.dying) {
          ctx.translate((Math.random() - 0.5) * b.crushProgress * 2, (Math.random() - 0.5) * b.crushProgress * 2);
          ctx.shadowColor = '#ff4466';
        }

        ctx.translate(cx, cy);
        drawShapeBlock(ctx, b);

        // Corner brackets on all blocks
        ctx.globalAlpha = b.alpha * 0.7;
        ctx.strokeStyle = b.crushProgress > 0 ? '#ff4466' : `hsl(${b.hue}, 100%, 70%)`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 8;
        const hs = b.w / 2, vs = b.h / 2, L = 10;
        ctx.beginPath();
        ctx.moveTo(-hs, -vs + L); ctx.lineTo(-hs, -vs); ctx.lineTo(-hs + L, -vs);
        ctx.moveTo(hs - L, -vs); ctx.lineTo(hs, -vs); ctx.lineTo(hs, -vs + L);
        ctx.moveTo(-hs, vs - L); ctx.lineTo(-hs, vs); ctx.lineTo(-hs + L, vs);
        ctx.moveTo(hs - L, vs); ctx.lineTo(hs, vs); ctx.lineTo(hs, vs - L);
        ctx.stroke();

        ctx.restore();
      }

      setBlockCount(blocksRef.current.filter(b => !b.dying).length);
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);

    return () => { window.removeEventListener('resize', handleResize); };
  }, []);

  return (
    <div
      className="relative w-screen h-screen flex items-center justify-center bg-[#0a1628] overflow-hidden font-mono text-[var(--cyan)] touch-none"
      onPointerDown={(e) => {
        // Only handle touch/pen for pinch zoom (avoid interfering with mouse)
        if (e.pointerType === 'mouse') return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        touchPtsRef.current.set(e.pointerId, getEvtPoint(e));

        const pts = [...touchPtsRef.current.values()];
        if (pts.length === 2) {
          const d = getDist(pts[0], pts[1]);
          const mid = getMid(pts[0], pts[1]);
          const nearest = findNearestBlockId(mid.x, mid.y);
          touchZoomRef.current = {
            active: true,
            startDist: Math.max(1, d),
            startScale: nearest.scale,
            blockId: nearest.id,
          };
          setGestureText('GESTURE: PINCH ZOOM');
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') return;
        if (!touchPtsRef.current.has(e.pointerId)) return;
        touchPtsRef.current.set(e.pointerId, getEvtPoint(e));

        const pts = [...touchPtsRef.current.values()];
        if (pts.length !== 2) return;

        const z = touchZoomRef.current;
        if (!z.active) return;

        const dist = getDist(pts[0], pts[1]);
        const ratio = dist / Math.max(1, z.startDist);
        const newScale = Math.max(0.3, Math.min(4.0, z.startScale * ratio));

        if (z.blockId != null) {
          const b = blocksRef.current.find((x) => x.id === z.blockId);
          if (b && !b.dying) {
            b.scale = newScale;
            b.w = 80 * newScale;
            b.h = 80 * newScale;
            setZoomDisplay(`${newScale.toFixed(1)}x`);
            setModeText(`MODE: ZOOM BLOCK [${newScale.toFixed(1)}x]`);
          }
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'mouse') return;
        touchPtsRef.current.delete(e.pointerId);
        if (touchPtsRef.current.size < 2) {
          touchZoomRef.current.active = false;
          touchZoomRef.current.blockId = null;
          setZoomDisplay('');
        }
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'mouse') return;
        touchPtsRef.current.delete(e.pointerId);
        if (touchPtsRef.current.size < 2) {
          touchZoomRef.current.active = false;
          touchZoomRef.current.blockId = null;
          setZoomDisplay('');
        }
      }}
    >

      {/* Loading screen */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#050e1f] via-[#0a1930] to-[#0d2040] text-[var(--cyan)] hud-font-orbitron">
          <div className="text-3xl font-black tracking-[0.4em] mb-4 text-glow-cyan">SHARKZ INDUSTRIES</div>
          <div className="text-xs tracking-[0.25em] text-[#6cc8ff] mb-8">MARK VIII — HOLOGRAPHIC DISPLAY SYSTEM</div>
          <div className="w-[280px] h-[4px] border border-[#1a4466] rounded relative overflow-hidden mb-4 bg-black/30">
            <div className="h-full bg-gradient-to-r from-[var(--cyan)] to-[var(--blue)] box-glow-cyan loadprogress-bar rounded"></div>
          </div>
          <div className="text-[10px] tracking-[0.15em] text-[#6cc8ff]">{loadStatus}</div>
        </div>
      )}

      {/* Camera */}
      <video ref={videoRef} playsInline autoPlay muted className="absolute w-full h-full object-cover" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      {/* Overlays */}
      <div className="absolute inset-0 scanlines pointer-events-none z-10"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(5,15,40,0.4)_100%)] pointer-events-none z-10"></div>
      <div className="absolute inset-0 bg-[rgba(0,200,255,0.02)] pointer-events-none z-10 flicker"></div>

      {/* Corners */}
      <div className="corner tl absolute top-4 left-4 w-[50px] h-[50px] opacity-60 z-20"></div>
      <div className="corner tr absolute top-4 right-4 w-[50px] h-[50px] opacity-60 z-20"></div>
      <div className="corner bl absolute bottom-4 left-4 w-[50px] h-[50px] opacity-60 z-20"></div>
      <div className="corner br absolute bottom-4 right-4 w-[50px] h-[50px] opacity-60 z-20"></div>

      {/* Header HUD */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 hud-font-orbitron text-[11px] tracking-[0.15em] text-glow-cyan opacity-95 glass-pill">
        <span className="text-[var(--blue)] opacity-50">◈</span>
        <span className="text-[14px] font-black tracking-[0.3em]">SHARKZ INDUSTRIES</span>
        <span className="text-[var(--blue)] opacity-50">|</span>
        <span>HUD v8.0</span>
        <span className="text-[var(--blue)] opacity-50">◈</span>
      </div>

      {/* Mode indicator */}
      <div className="absolute top-[62px] left-1/2 -translate-x-1/2 z-20 hud-font-orbitron text-[10px] font-bold tracking-[0.2em] text-[var(--orange)] text-glow-orange mode-badge">
        {modeText}
      </div>

      {/* Toast */}
      <div className={`hud-toast ${toastVisible ? 'show' : ''}`}>{toastMsg}</div>

      {/* Shape Selector */}
      <div className="absolute top-[90px] left-4 z-20 glass-box">
        <div className="text-[var(--orange)] text-glow-orange text-[11px] tracking-[0.15em] mb-2 hud-font-orbitron">◈ SHAPE BLOCKS</div>
        {shapes.map(s => (
          <button
            key={s.key}
            className={`shape-btn ${currentShape === s.key ? 'active' : ''}`}
            onClick={() => { setCurrentShape(s.key); showToast(`◈ SHAPE: ${s.label} ◈`); }}
          >
            <span className="text-[18px] min-w-[26px] text-center">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
        {zoomDisplay && (
          <div className="mt-2 pt-2 border-t border-[var(--glass-border)]">
            <div className="text-[10px] text-[var(--yellow)] text-glow-orange tracking-[0.1em]">🔍 ZOOM: {zoomDisplay}</div>
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-[var(--glass-border)] text-[9px] text-[#6cc8ff] opacity-60">
          🤏🤏 TOUCH PINCH (TWO FINGERS) TO ZOOM
        </div>
      </div>

      {/* Left info panel */}
      <div className="absolute bottom-[120px] left-4 z-20 hud-panel text-[10px] leading-[2]">
        <div className="text-[var(--cyan)] mb-2 hud-font-orbitron tracking-widest text-glow-cyan text-[11px]">◈ HOLOGRAPHIC OS ◈</div>
        <div>HANDS: <span className="text-[var(--cyan)]">{handCount}</span></div>
        <div>FACE: <span className={faceDetected ? 'text-[var(--green)]' : 'text-[#3a6090]'}>{faceDetected ? 'YES' : 'NO'}</span></div>
        <div>BLOCKS: <span className="text-[var(--orange)]">{blockCount}</span></div>
        <div className="text-[var(--orange)]">{gestureText}</div>
        <div>SHAPE: <span className="text-[var(--cyan)]">{currentShape.toUpperCase()}</span></div>
        <div className="mt-2 pt-2 border-t border-[var(--glass-border)] opacity-60">
          <div>SYS: <span className="text-[var(--green)]">ONLINE</span></div>
          <div>ARC REACTOR: <span className="text-[var(--green)]">100%</span></div>
        </div>
      </div>

      {/* Right face panel */}
      <div className="absolute top-[90px] right-4 z-20 glass-box text-right text-[10px] leading-[2.2]" style={{ borderColor: 'rgba(51,255,170,0.2)' }}>
        <div className="text-[#6cc8ff] text-glow-blue text-[11px] tracking-[0.15em] mb-1 hud-font-orbitron">◈ FACE ANALYSIS</div>
        <div className="text-[var(--green)] text-glow-green tracking-[0.12em] text-[12px] hud-font-orbitron mt-1">{expressionText}</div>
      </div>

      {/* Right info panel */}
      <div className="absolute bottom-[120px] right-4 z-20 hud-panel text-right text-[10px] leading-[2]">
        <div>LAT: 40.7128° N</div>
        <div>LON: 74.0060° W</div>
        <div>ALT: 0312M</div>
        <div>TEMP: 21.4°C</div>
        <div>SIGNAL: ████░ 82%</div>
      </div>

      {/* Bottom status */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass-box text-center hud-font-orbitron text-[10px] font-bold tracking-[0.2em] text-[var(--cyan)] text-glow-cyan">
        GESTURE RECOGNITION SYSTEM
        <div className="text-[13px] font-black tracking-[0.3em] mt-1">{gestureText}</div>
        <div className="text-[var(--orange)] text-glow-orange text-[10px] mt-1">HOLO-BLOCKS: {blockCount}</div>
      </div>

      {/* Controls panel */}
      <div className="absolute bottom-6 left-4 z-20">
        <details className="glass-box cursor-pointer">
          <summary className="hud-font-orbitron text-[11px] font-bold tracking-[0.15em] text-[var(--cyan)] text-glow-cyan list-none">
            ◈ CONTROLS [ ? ]
          </summary>
          <div className="mt-3 text-[10px] leading-[2] text-[#8ad4f0] max-h-[300px] overflow-y-auto">
            <div className="text-[var(--cyan)] hud-font-orbitron text-[9px] tracking-[0.15em] mb-1">✋ HAND GESTURES</div>
            <div>🤏 <span className="text-[var(--orange)]">PINCH HOLD</span> → Spawn block</div>
            <div>🤏 <span className="text-[var(--orange)]">PINCH BLOCK</span> → Move block</div>
            <div>✊ <span className="text-[var(--orange)]">FIST OVER</span> → Crush delete</div>
            <div className="text-[var(--cyan)] hud-font-orbitron text-[9px] tracking-[0.15em] mt-2 mb-1">🤝 TWO-HAND</div>
            <div>🔺 <span className="text-[var(--orange)]">TRIANGLE</span> → Place triangle</div>
            <div>✕ <span className="text-[var(--orange)]">X-CROSS</span> → Delete ALL</div>
            <div>🤏🤏 <span className="text-[var(--orange)]">PINCH BOTH</span> → Zoom block (spread/pinch)</div>
            <div className="text-[var(--green)] hud-font-orbitron text-[9px] tracking-[0.15em] mt-2 mb-1">😎 EXPRESSIONS (14+)</div>
            <div>😊 Happy · 😢 Sad · 😠 Angry · 😭 Crying</div>
            <div>😒 Annoyed · 😏 Smirking · 😴 Sleepy</div>
            <div>😲 Surprised · 😮 Shocked · 😤 Frustrated</div>
            <div>😜 Winking · 😆 Laughing · 😌 Eyes Closed</div>
          </div>
        </details>
      </div>
    </div>
  );
}
