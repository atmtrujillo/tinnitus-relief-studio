import { useRef, useEffect } from 'react';
import { engine } from '../../audio';
import { useAppContext } from '../../store/AppContext';

interface SpectrumDisplayProps {
  isActive: boolean;
  height?: number;
  /** Optional vertical marker (e.g. calibrated tinnitus frequency in Hz). */
  markerFrequency?: number | null;
  label?: string;
  className?: string;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const FREQ_TICKS = [50, 100, 200, 500, 1000, 2000, 4000, 8000, 16000];

function freqToX(freq: number, width: number): number {
  const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
  return ((Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * width;
}

function tickLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

/**
 * Responsive, high-DPI logarithmic frequency spectrum analyser (20 Hz – 20 kHz).
 * Pulls directly from engine.spectrumAnalyser inside requestAnimationFrame.
 */
export function SpectrumDisplay({
  isActive,
  height = 170,
  markerFrequency,
  label = 'Spectrum Analyser',
  className = '',
}: SpectrumDisplayProps) {
  const { state } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = container.clientWidth || 600;
    const resize = () => {
      width = Math.max(200, container.clientWidth);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let bins: Float32Array<ArrayBuffer> | null = null;
    const padBottom = 20;
    const plotH = height - padBottom;

    const drawGrid = () => {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Horizontal dB lines (-20, -40, -60, -80, -100 dB)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = (plotH * i) / 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical logarithmic frequency ticks
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(156, 163, 175, 0.65)';
      for (const hz of FREQ_TICKS) {
        const x = freqToX(hz, width);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
        ctx.fillText(tickLabel(hz), x, height - 5);
      }

      // Optional calibrated tinnitus frequency marker
      if (markerFrequency && markerFrequency >= MIN_FREQ && markerFrequency <= MAX_FREQ) {
        const mx = freqToX(markerFrequency, width);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx, plotH);
        ctx.stroke();
        ctx.restore();
      }
    };

    const fps = Math.max(10, Math.min(60, state.settings.visualizerFps || 60));
    const frameInterval = 1000 / fps;
    let lastDraw = 0;
    let raf = 0;

    const render = (ts: number) => {
      if (isActive && ts - lastDraw < frameInterval) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastDraw = ts;
      drawGrid();

      const analyser = engine.spectrumAnalyser;
      const sampleRate = engine.context?.sampleRate ?? 48000;

      if (!isActive || !analyser) {
        return;
      }

      if (!bins || bins.length !== analyser.frequencyBinCount) {
        bins = new Float32Array(analyser.frequencyBinCount);
      }
      analyser.getFloatFrequencyData(bins);

      const nyquist = sampleRate / 2;
      const binHz = nyquist / bins.length;
      const minDb = -110;
      const maxDb = -5;

      // Sample columns across the log-frequency axis for a smooth filled curve
      const cols = Math.min(Math.floor(width), 320);
      const grad = ctx.createLinearGradient(0, plotH, 0, 0);
      grad.addColorStop(0, 'rgba(79, 143, 255, 0.12)');
      grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.45)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.85)');

      const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
      lineGrad.addColorStop(0, '#4f8fff');
      lineGrad.addColorStop(0.5, '#8b5cf6');
      lineGrad.addColorStop(1, '#06b6d4');

      ctx.beginPath();
      ctx.moveTo(0, plotH);

      const points: [number, number][] = [];
      for (let c = 0; c <= cols; c++) {
        const t = c / cols;
        const f0 = Math.pow(10, LOG_MIN + t * (LOG_MAX - LOG_MIN));
        const f1 = Math.pow(10, LOG_MIN + Math.min(1, (c + 1) / cols) * (LOG_MAX - LOG_MIN));
        const b0 = Math.max(0, Math.floor(f0 / binHz));
        const b1 = Math.min(bins.length - 1, Math.max(b0, Math.ceil(f1 / binHz)));

        // Peak-hold within each pixel column so narrow sine peaks never vanish
        let peak = -Infinity;
        for (let b = b0; b <= b1; b++) {
          if (bins[b] > peak) peak = bins[b];
        }
        const norm = Math.max(0, Math.min(1, (peak - minDb) / (maxDb - minDb)));
        const x = t * width;
        const y = plotH - norm * (plotH - 6);
        points.push([x, y]);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Crisp top contour
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1.75;
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isActive, height, markerFrequency, state.settings.visualizerFps]);

  return (
    <div className={className} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
          <span className="text-xs text-gray-500 font-mono">20 Hz – 20 kHz (Log)</span>
        </div>
      )}
      <canvas ref={canvasRef} className="rounded-lg border border-white/5 block w-full" />
    </div>
  );
}
