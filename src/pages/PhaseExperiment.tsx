import { useState, useEffect, useCallback } from 'react';
import { Play, Square, AlertTriangle, Info, FlipHorizontal } from 'lucide-react';
import { engine, buildPhase, type PhaseHandle, type PhaseMode } from '../audio';
import { useAppContext } from '../store/AppContext';
import { useEngine } from '../hooks';
import { FrequencyControl, VolumeSlider } from '../components/controls';
import { WaveformDisplay } from '../components/visualizer';
import { formatFrequency } from '../utils';
import type { WaveformType } from '../types';

const MODES: { id: PhaseMode; label: string; desc: string }[] = [
  { id: 'normal', label: 'Normal (0°)', desc: 'Signal A only' },
  { id: 'inverted', label: 'Inverted (180°)', desc: 'Polarity-inverted signal B only' },
  { id: 'sum', label: 'Sum (A + B)', desc: 'Mixed together — cancels when matched' },
  { id: 'dichotic', label: 'Dichotic (L / R)', desc: 'Normal left ear, inverted right ear' },
];

export function PhaseExperiment() {
  const { state } = useAppContext();
  const snap = useEngine();

  const [frequency, setFrequency] = useState(state.tinnitusProfile?.frequency ?? 4000);
  const [waveform, setWaveform] = useState<WaveformType>('sine');
  const [mode, setMode] = useState<PhaseMode>('normal');
  const [levelA, setLevelA] = useState(0.5);
  const [levelB, setLevelB] = useState(0.5);
  const [offsetDeg, setOffsetDeg] = useState(0);
  const [measuredPhase, setMeasuredPhase] = useState<number | null>(null);

  const isThisPlaying = snap.status === 'playing' && snap.info?.source === 'phase';
  const isThisActive = snap.status !== 'idle' && snap.info?.source === 'phase';
  const handle = engine.getHandle<PhaseHandle>('phase');

  // Push live parameter updates
  useEffect(() => {
    const h = engine.getHandle<PhaseHandle>('phase');
    if (!h) return;
    h.update({ frequency, waveform, levelA, levelB, mode, offsetDeg });
    engine.updateInfo('phase', {
      frequency,
      label: `Phase Experiment (${mode})`,
      technique: `Phase Inversion — ${mode}`,
    });
  }, [frequency, waveform, levelA, levelB, mode, offsetDeg]);

  // Periodically update measured phase difference readout while playing
  useEffect(() => {
    if (!isThisPlaying) {
      setMeasuredPhase(null);
      return;
    }
    const id = window.setInterval(() => {
      const h = engine.getHandle<PhaseHandle>('phase');
      if (h) setMeasuredPhase(h.measurePhaseDeg());
    }, 150);
    return () => window.clearInterval(id);
  }, [isThisPlaying]);

  const handlePlay = useCallback(async () => {
    await engine.start(
      {
        source: 'phase',
        label: `Phase Experiment (${mode})`,
        technique: `Phase Inversion — ${mode}`,
        frequency,
      },
      (ctx, out) =>
        buildPhase(ctx, out, { frequency, waveform, levelA, levelB, mode, offsetDeg }),
      { fadeIn: 0.06, fadeOut: 0.06 }
    );
  }, [frequency, waveform, levelA, levelB, mode, offsetDeg]);

  const handleStop = useCallback(() => {
    engine.stop(0.05);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Phase Inversion Experiment</h1>
        <p className="text-sm text-gray-400 mt-1">
          Generate a phase-locked tone and its exact 180° inverted counterpart using the Web
          Audio API. Switch between signals, adjust levels independently, and inspect both
          waveforms live.
        </p>
      </div>

      {/* Clear scientific disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-200">
              Experimental Feature — Important Scientific Distinction
            </h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Acoustic phase cancellation works on physical sound waves in the air (for
              example, active noise-cancelling headphones). Tinnitus is usually generated
              internally within the auditory pathway rather than by an external sound wave,
              so playing a 180° phase-inverted tone cannot guarantee tinnitus cancellation
              and may not affect internally generated tinnitus. Treat this module strictly
              as an experimental audio exploration tool, not a clinically established
              treatment.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel p-6 space-y-6">
        <FrequencyControl frequency={frequency} onChange={setFrequency} />

        {/* Mode selector */}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
            Output Routing Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-3 rounded-lg text-left transition-all border ${
                  mode === m.id
                    ? 'bg-accent-purple/20 border-accent-purple/50 text-white'
                    : 'bg-surface-700 border-transparent text-gray-300 hover:bg-surface-600'
                }`}
              >
                <span className="text-xs font-semibold block">{m.label}</span>
                <span className="text-[11px] text-gray-400 block mt-0.5">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Independent volume sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-900/60 p-4 rounded-lg border border-accent-blue/20">
            <VolumeSlider
              volume={levelA}
              onChange={setLevelA}
              max={1}
              label="Signal A (Normal 0°) Level"
            />
          </div>
          <div className="bg-surface-900/60 p-4 rounded-lg border border-accent-purple/20">
            <VolumeSlider
              volume={levelB}
              onChange={setLevelB}
              max={1}
              label="Signal B (Inverted 180°) Level"
            />
          </div>
        </div>

        {/* Fine phase offset + Waveform */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                Extra Phase Offset on Signal B
              </label>
              <span className="text-xs font-mono text-accent-purple">
                {offsetDeg > 0 ? `+${offsetDeg}°` : `${offsetDeg}°`} (total{' '}
                {((180 + offsetDeg + 360) % 360)}°)
              </span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={offsetDeg}
              onChange={(e) => setOffsetDeg(parseInt(e.target.value, 10))}
              className="slider-track"
            />
            <div className="flex justify-between text-[11px] text-gray-500 mt-1">
              <span>−180°</span>
              <button
                onClick={() => setOffsetDeg(0)}
                className="text-accent-blue hover:underline"
              >
                Reset to exact 180°
              </button>
              <span>+180°</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
              Waveform
            </label>
            <div className="flex gap-2">
              {(['sine', 'triangle', 'square', 'sawtooth'] as WaveformType[]).map((wf) => (
                <button
                  key={wf}
                  onClick={() => setWaveform(wf)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                    waveform === wf
                      ? 'bg-accent-purple text-white'
                      : 'bg-surface-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {wf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Playback & live phase status */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5">
          <div className="flex items-center gap-3">
            {isThisActive ? (
              <button onClick={handleStop} className="btn-danger flex items-center gap-2 text-sm">
                <Square className="w-4 h-4 fill-current" />
                Stop Experiment
              </button>
            ) : (
              <button onClick={handlePlay} className="btn-primary flex items-center gap-2 text-sm">
                <Play className="w-4 h-4" />
                Start Experiment
              </button>
            )}

            <button
              onClick={() => setMode((m) => (m === 'normal' ? 'inverted' : 'normal'))}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <FlipHorizontal className="w-4 h-4 text-accent-purple" />
              Flip Normal / Inverted
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
            <span>{formatFrequency(frequency)}</span>
            <span>
              Measured Δφ:{' '}
              <strong className="text-accent-purple">
                {measuredPhase !== null ? `${measuredPhase.toFixed(1)}°` : '—'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Dual-signal waveform display + Master Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <WaveformDisplay
            analyser={handle?.analyserA ?? null}
            secondaryAnalyser={handle?.analyserB ?? null}
            isActive={isThisPlaying}
            height={180}
            color="#4f8fff"
            secondaryColor="#a855f7"
            label="Signal A (0°)"
            secondaryLabel="Signal B (180°)"
          />
        </div>
        <div className="glass-panel p-4">
          <WaveformDisplay
            isActive={isThisPlaying}
            height={180}
            color="#06b6d4"
            label={`Combined Output (${mode})`}
          />
        </div>
      </div>

      {/* Technical explanation */}
      <div className="glass-panel p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-blue mt-0.5 shrink-0" />
          <div className="text-xs text-gray-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-gray-200">DSP Implementation:</strong> A single
              phase-locked <code className="text-gray-300">OscillatorNode</code> splits
              into two branches so they can never drift apart. Branch B passes through a{' '}
              <code className="text-gray-300">GainNode</code> with gain{' '}
              <code className="text-gray-300">-1</code> (exact 180° polarity inversion) and
              a sub-period <code className="text-gray-300">DelayNode</code> for fine phase
              offset testing.
            </p>
            <p>
              Try <strong className="text-gray-200">Sum (A + B)</strong> with equal levels
              and 0° offset to verify true acoustic/digital destructive interference — the
              combined output collapses to a flat line. Then nudge the offset or one level
              slider to watch the wave reappear.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
