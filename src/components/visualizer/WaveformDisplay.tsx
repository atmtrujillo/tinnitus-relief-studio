import { useRef, useEffect } from 'react';
import { engine } from '../../audio';
import { useAppContext } from '../../store/AppContext';

interface WaveformDisplayProps {
  /** Override analyser (defaults to engine.scopeAnalyser). */
  analyser?: AnalyserNode | null;
  /** Optional second analyser overlaid on the same canvas (e.g. phase comparison). */
  secondaryAnalyser?: AnalyserNode | null;
  isActive: boolean;
  height?: number;
  color?: string;
  secondaryColor?: string;
  label?: string;
  secondaryLabel?: string;
  className?: string;
}

/**
 * Responsive, high-DPI time-domain oscilloscope.
 *
 * Reads directly from AnalyserNode inside requestAnimationFrame (throttled
 * to settings.visualizerFps) so React never re-renders on audio frames.
 * Uses a rising zero-crossing trigger so periodic waveforms stay rock-steady.
 */
export function WaveformDisplay({
  analyser,
  secondaryAnalyser,
  isActive,
  height = 160,
  color = '#4f8fff',
  secondaryColor = '#a855f7',
  label = 'Waveform',
  secondaryLabel,
  className = '',
}: WaveformDisplayProps) {
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

    const drawGrid = () => {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (height * i) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      for (let i = 1; i < 8; i++) {
        const x = (width * i) / 8;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Centre 0-axis
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    const drawIdle = () => {
      drawGrid();
      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    const resize = () => {
      width = Math.max(200, container.clientWidth);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!isActive) drawIdle();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let bufA: Float32Array<ArrayBuffer> | null = null;
    let bufB: Float32Array<ArrayBuffer> | null = null;

    /** Find a rising zero-crossing in the first half of the buffer for trigger lock. */
    const findTrigger = (data: Float32Array, maxSearch: number): number => {
      for (let i = 1; i < maxSearch; i++) {
        if (data[i - 1] <= 0 && data[i] > 0) return i;
      }
      return 0;
    };

    const drawTrace = (
      data: Float32Array,
      start: number,
      samplesToShow: number,
      strokeColor: string,
      lineWidth = 2
    ) => {
      const step = width / Math.max(1, samplesToShow - 1);
      const mid = height / 2;
      const scale = height * 0.44;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < samplesToShow; i++) {
        const idx = start + i;
        const v = idx < data.length ? data[idx] : 0;
        const x = i * step;
        const y = mid - Math.max(-1, Math.min(1, v)) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
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

      const primary = analyser !== undefined ? analyser : engine.scopeAnalyser;

      if (!isActive || !primary) {
        drawIdle();
        return;
      }

      if (!bufA || bufA.length !== primary.fftSize) {
        bufA = new Float32Array(primary.fftSize);
      }
      primary.getFloatTimeDomainData(bufA);

      const samplesToShow = Math.min(1024, Math.floor(bufA.length / 2));
      const trigger = findTrigger(bufA, bufA.length - samplesToShow);

      // Draw secondary trace first so primary stays on top
      if (secondaryAnalyser) {
        if (!bufB || bufB.length !== secondaryAnalyser.fftSize) {
          bufB = new Float32Array(secondaryAnalyser.fftSize);
        }
        secondaryAnalyser.getFloatTimeDomainData(bufB);
        drawTrace(bufB, trigger, samplesToShow, secondaryColor + '40', 5);
        drawTrace(bufB, trigger, samplesToShow, secondaryColor, 2);
      }

      drawTrace(bufA, trigger, samplesToShow, color + '35', 5);
      drawTrace(bufA, trigger, samplesToShow, color, 2);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, secondaryAnalyser, isActive, height, color, secondaryColor, state.settings.visualizerFps]);

  return (
    <div className={className} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
            {secondaryLabel && (
              <span className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: secondaryColor }} />
                {secondaryLabel}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 font-mono">Time Domain</span>
        </div>
      )}
      <canvas ref={canvasRef} className="rounded-lg border border-white/5 block w-full" />
    </div>
  );
}
