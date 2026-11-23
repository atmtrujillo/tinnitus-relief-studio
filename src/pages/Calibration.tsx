import { useState, useEffect, useCallback } from 'react';
import { Save, Play, Square, RotateCcw, Music, CheckCircle2, Radio } from 'lucide-react';
import { engine, buildCalibration, type CalibrationHandle } from '../audio';
import { useAppContext } from '../store/AppContext';
import { useEngine } from '../hooks';
import { FrequencyControl, VolumeSlider } from '../components/controls';
import { WaveformDisplay, SpectrumDisplay } from '../components/visualizer';
import { SafetyBanner } from '../components/common';
import { formatFrequency, MUSICAL_NOTES } from '../utils';
import type { Ear, WaveformType } from '../types';

export function Calibration() {
  const { state, dispatch } = useAppContext();
  const snap = useEngine();

  const [frequency, setFrequency] = useState(state.tinnitusProfile?.frequency ?? 4000);
  const [waveform, setWaveform] = useState<WaveformType>(state.tinnitusProfile?.waveform ?? 'sine');
  const [soundType, setSoundType] = useState<'tone' | 'narrowband'>(
    state.tinnitusProfile?.soundType ?? 'tone'
  );
  const [bandwidthOct, setBandwidthOct] = useState(state.tinnitusProfile?.bandwidthOct ?? 0.33);
  const [ear, setEar] = useState<Ear>(state.tinnitusProfile?.ear ?? 'both');
  const [pulsed, setPulsed] = useState(false);
  const [level, setLevel] = useState(0.5);

  // Sweep settings
  const [sweepFrom, setSweepFrom] = useState(500);
  const [sweepTo, setSweepTo] = useState(12000);
  const [sweepSec, setSweepSec] = useState(25);
  const [sweeping, setSweeping] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const isThisPlaying = snap.status === 'playing' && snap.info?.source === 'calibration';
  const isThisActive = snap.status !== 'idle' && snap.info?.source === 'calibration';

  // Push live parameter edits to the running calibration program
  useEffect(() => {
    const handle = engine.getHandle<CalibrationHandle>('calibration');
    if (!handle) return;
    handle.update({
      frequency,
      waveform,
      soundType,
      bandwidthOct,
      level,
      ear,
      pulsed,
    });
    engine.updateInfo('calibration', {
      frequency,
      label: soundType === 'tone' ? `Calibration Tone (${waveform})` : 'Calibration Narrowband',
    });
  }, [frequency, waveform, soundType, bandwidthOct, level, ear, pulsed]);

  // Track live frequency while a sweep is running
  useEffect(() => {
    if (!sweeping) return;
    let raf = 0;
    const tick = () => {
      const handle = engine.getHandle<CalibrationHandle>('calibration');
      if (!handle || !handle.isSweeping()) {
        if (handle) setFrequency(Math.round(handle.getCurrentFrequency()));
        setSweeping(false);
        return;
      }
      setFrequency(Math.round(handle.getCurrentFrequency()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sweeping]);

  const handlePlay = useCallback(async () => {
    await engine.start(
      {
        source: 'calibration',
        label: soundType === 'tone' ? `Calibration Tone (${waveform})` : 'Calibration Narrowband',
        technique: `Calibration (${soundType})`,
        frequency,
      },
      (ctx, out) =>
        buildCalibration(ctx, out, {
          frequency,
          waveform,
          soundType,
          bandwidthOct,
          level,
          ear,
          pulsed,
        }),
      { fadeIn: 0.08, fadeOut: 0.08 }
    );
  }, [frequency, waveform, soundType, bandwidthOct, level, ear, pulsed]);

  const handleStop = useCallback(() => {
    setSweeping(false);
    engine.stop(0.06);
  }, []);

  const handleToggleSweep = useCallback(async () => {
    const existing = engine.getHandle<CalibrationHandle>('calibration');
    if (sweeping && existing) {
      const locked = Math.round(existing.stopSweep());
      setFrequency(locked);
      setSweeping(false);
      return;
    }

    let handle = existing;
    if (!handle) {
      handle = await engine.start(
        {
          source: 'calibration',
          label: 'Calibration Sweep',
          technique: 'Frequency Sweep',
          frequency: sweepFrom,
        },
        (ctx, out) =>
          buildCalibration(ctx, out, {
            frequency: sweepFrom,
            waveform,
            soundType,
            bandwidthOct,
            level,
            ear,
            pulsed,
          }),
        { fadeIn: 0.08, fadeOut: 0.08 }
      );
    }
    if (handle) {
      handle.startSweep(sweepFrom, sweepTo, sweepSec);
      setSweeping(true);
    }
  }, [sweeping, sweepFrom, sweepTo, sweepSec, waveform, soundType, bandwidthOct, level, ear, pulsed]);

  const handleSave = () => {
    dispatch({
      type: 'SET_TINNITUS_PROFILE',
      payload: {
        frequency: Math.round(frequency),
        soundType,
        waveform,
        bandwidthOct,
        ear,
        savedAt: new Date().toISOString(),
      },
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Tinnitus Frequency Calibration</h1>
        <p className="text-sm text-gray-400 mt-1">
          Compare a generated tone or narrowband noise against your perceived tinnitus to
          manually identify the closest pitch match. This is a subjective matching aid, not
          a clinical hearing test.
        </p>
      </div>

      <SafetyBanner />

      {/* Main controls */}
      <div className="glass-panel p-6 space-y-6">
        {/* Sound Type & Ear Routing */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
              Match Signal
            </label>
            <div className="flex gap-2">
              {(['tone', 'narrowband'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSoundType(t)}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg capitalize transition-all ${
                    soundType === t
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {t === 'tone' ? 'Pure Tone' : 'Narrowband'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
              Ear Routing
            </label>
            <div className="flex gap-2">
              {(['left', 'both', 'right'] as Ear[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEar(e)}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg capitalize transition-all ${
                    ear === e
                      ? 'bg-accent-purple text-white'
                      : 'bg-surface-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
              Presentation
            </label>
            <button
              onClick={() => setPulsed((v) => !v)}
              className={`w-full px-3 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${
                pulsed
                  ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                  : 'bg-surface-700 text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              {pulsed ? 'Pulsed (2 Hz — easier to compare)' : 'Continuous'}
            </button>
          </div>
        </div>

        {/* Frequency slider + 1 Hz fine controls */}
        <FrequencyControl
          frequency={frequency}
          onChange={(f) => {
            if (sweeping) {
              engine.getHandle<CalibrationHandle>('calibration')?.stopSweep();
              setSweeping(false);
            }
            setFrequency(f);
          }}
        />

        {/* Waveform or Bandwidth */}
        {soundType === 'tone' ? (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-2">
              Oscillator Waveform
            </label>
            <div className="flex flex-wrap gap-2">
              {(['sine', 'triangle', 'square', 'sawtooth'] as WaveformType[]).map((wf) => (
                <button
                  key={wf}
                  onClick={() => setWaveform(wf)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                    waveform === wf
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {wf}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                Narrowband Width
              </label>
              <span className="text-xs font-mono text-gray-300">
                {bandwidthOct.toFixed(2)} octaves
              </span>
            </div>
            <input
              type="range"
              min={0.08}
              max={1.5}
              step={0.02}
              value={bandwidthOct}
              onChange={(e) => setBandwidthOct(parseFloat(e.target.value))}
              className="slider-track"
            />
          </div>
        )}

        <VolumeSlider
          volume={level}
          onChange={setLevel}
          max={1}
          label="Calibration Signal Level (relative to Master Volume)"
        />

        {/* Playback + Save */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
          {isThisActive ? (
            <button onClick={handleStop} className="btn-danger flex items-center gap-2 text-sm">
              <Square className="w-4 h-4 fill-current" />
              Stop Tone
            </button>
          ) : (
            <button onClick={handlePlay} className="btn-primary flex items-center gap-2 text-sm">
              <Play className="w-4 h-4" />
              Play Calibration Signal
            </button>
          )}

          <button
            onClick={handleToggleSweep}
            className={`btn-secondary flex items-center gap-2 text-sm ${
              sweeping ? 'ring-2 ring-accent-purple text-white' : ''
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${sweeping ? 'animate-spin' : ''}`} />
            {sweeping ? 'Lock Current Frequency' : 'Start Frequency Sweep'}
          </button>

          <button
            onClick={handleSave}
            className="btn-secondary flex items-center gap-2 text-sm ml-auto border border-accent-blue/30 text-accent-blue hover:text-white"
          >
            {savedNotice ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-accent-green" />
                <span className="text-accent-green">Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save as My Tinnitus Frequency</span>
              </>
            )}
          </button>
        </div>

        {/* Sweep range configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-900/60 p-3 rounded-lg border border-white/5 text-xs">
          <div>
            <label className="text-gray-400 block mb-1">Sweep Start (Hz)</label>
            <input
              type="number"
              min={20}
              max={19000}
              value={sweepFrom}
              onChange={(e) => setSweepFrom(Math.max(20, Math.min(19000, parseInt(e.target.value, 10) || 20)))}
              className="input-field py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-gray-400 block mb-1">Sweep End (Hz)</label>
            <input
              type="number"
              min={20}
              max={20000}
              value={sweepTo}
              onChange={(e) => setSweepTo(Math.max(20, Math.min(20000, parseInt(e.target.value, 10) || 12000)))}
              className="input-field py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-gray-400 block mb-1">Sweep Duration (s)</label>
            <input
              type="number"
              min={3}
              max={180}
              value={sweepSec}
              onChange={(e) => setSweepSec(Math.max(3, Math.min(180, parseInt(e.target.value, 10) || 25)))}
              className="input-field py-1.5 text-xs font-mono"
            />
          </div>
        </div>

        {state.tinnitusProfile && (
          <p className="text-xs text-gray-400">
            Saved tinnitus profile:{' '}
            <span className="font-mono text-accent-blue">
              {formatFrequency(state.tinnitusProfile.frequency)}
            </span>{' '}
            ({state.tinnitusProfile.soundType}, {state.tinnitusProfile.ear} ear)
          </p>
        )}
      </div>

      {/* Playable Reference Tones */}
      <div className="glass-panel p-5">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <Music className="w-4 h-4 text-accent-blue" />
          Reference Tones (click to jump)
        </h3>
        <div className="flex flex-wrap gap-2">
          {MUSICAL_NOTES.map((note) => (
            <button
              key={note.name}
              onClick={() => setFrequency(note.freq)}
              className={`px-2.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                Math.abs(frequency - note.freq) <= 3
                  ? 'bg-accent-blue text-white'
                  : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
              }`}
            >
              {note.name} <span className="text-gray-500">{note.freq}Hz</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live visualisations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <WaveformDisplay isActive={isThisPlaying} height={150} label="Calibration Waveform" />
        </div>
        <div className="glass-panel p-4">
          <SpectrumDisplay
            isActive={isThisPlaying}
            height={150}
            markerFrequency={state.tinnitusProfile?.frequency ?? frequency}
            label="Frequency Spectrum"
          />
        </div>
      </div>
    </div>
  );
}
