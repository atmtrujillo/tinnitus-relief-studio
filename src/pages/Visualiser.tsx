import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Activity } from 'lucide-react';
import { engine, buildCalibration, buildTherapy, volumeToDb } from '../audio';
import { useAppContext } from '../store/AppContext';
import { useEngine } from '../hooks';
import { FrequencyControl } from '../components/controls';
import { WaveformDisplay, SpectrumDisplay } from '../components/visualizer';
import { SafetyBanner } from '../components/common';
import { formatFrequency, generateId } from '../utils';
import type { NoiseColor, WaveformType } from '../types';

export function Visualiser() {
  const { state } = useAppContext();
  const snap = useEngine();

  const [testMode, setTestMode] = useState<'tone' | 'noise'>('tone');
  const [frequency, setFrequency] = useState(state.tinnitusProfile?.frequency ?? 1000);
  const [waveform, setWaveform] = useState<WaveformType>('sine');
  const [noiseColor, setNoiseColor] = useState<NoiseColor>('pink');

  // Real-time DSP metrics (peak frequency & RMS amplitude)
  const [rmsDbfs, setRmsDbfs] = useState<number>(-Infinity);
  const [peakHz, setPeakHz] = useState<number | null>(null);

  const isPlaying = snap.status === 'playing';
  const isVisualiserSource = snap.info?.source === 'visualiser';

  useEffect(() => {
    if (!isPlaying) {
      setRmsDbfs(-Infinity);
      setPeakHz(null);
      return;
    }

    const id = window.setInterval(() => {
      const scope = engine.scopeAnalyser;
      const spec = engine.spectrumAnalyser;
      const sr = engine.context?.sampleRate ?? 48000;

      if (scope) {
        const buf = new Float32Array(scope.fftSize);
        scope.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const masterDb = volumeToDb(snap.masterVolume);
        const db = rms > 1e-6 && Number.isFinite(masterDb)
          ? 20 * Math.log10(rms) + masterDb
          : -Infinity;
        setRmsDbfs(db);
      }

      if (spec) {
        const bins = new Float32Array(spec.frequencyBinCount);
        spec.getFloatFrequencyData(bins);
        let maxIdx = -1;
        let maxVal = -100;
        for (let i = 1; i < bins.length; i++) {
          if (bins[i] > maxVal) {
            maxVal = bins[i];
            maxIdx = i;
          }
        }
        if (maxIdx > 0) {
          const binHz = sr / 2 / bins.length;
          setPeakHz(Math.round(maxIdx * binHz));
        } else {
          setPeakHz(null);
        }
      }
    }, 120);

    return () => window.clearInterval(id);
  }, [isPlaying, snap.masterVolume]);

  const startTestSignal = useCallback(async () => {
    if (testMode === 'tone') {
      await engine.start(
        {
          source: 'visualiser',
          label: `Test Tone (${waveform})`,
          technique: `Visualiser Test (${waveform})`,
          frequency,
        },
        (ctx, out) =>
          buildCalibration(ctx, out, {
            frequency,
            waveform,
            soundType: 'tone',
            bandwidthOct: 0.33,
            level: 0.5,
            ear: 'both',
            pulsed: false,
          }),
        { fadeIn: 0.05, fadeOut: 0.05 }
      );
    } else {
      await engine.start(
        {
          source: 'visualiser',
          label: `Test Noise (${noiseColor})`,
          technique: `Visualiser Test (${noiseColor} noise)`,
          frequency: null,
        },
        (ctx, out) =>
          buildTherapy(ctx, out, {
            layers: [
              {
                id: generateId(),
                kind: 'noise',
                enabled: true,
                color: noiseColor,
                frequency: 1000,
                bandwidthOct: 0.5,
                waveform: 'sine',
                level: 0.55,
                pan: 0,
              },
            ],
          }),
        { fadeIn: 0.08, fadeOut: 0.08 }
      );
    }
  }, [testMode, frequency, waveform, noiseColor]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Audio Visualiser</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time time-domain oscilloscope and logarithmic frequency spectrum analyser
            tapped directly from the Web Audio API.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
          <Activity className={`w-4 h-4 ${isPlaying ? 'text-accent-green' : 'text-gray-600'}`} />
          <span>{snap.info ? snap.info.label : 'Listening to master bus'}</span>
        </div>
      </div>

      {/* Live telemetry cards */}
      <SafetyBanner />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-panel p-4">
          <span className="text-xs text-gray-500 block">Target / Active Freq</span>
          <span className="text-lg font-mono font-semibold text-accent-blue">
            {snap.info?.frequency != null ? formatFrequency(snap.info.frequency) : 'Broadband'}
          </span>
        </div>
        <div className="glass-panel p-4">
          <span className="text-xs text-gray-500 block">Measured FFT Peak</span>
          <span className="text-lg font-mono font-semibold text-accent-cyan">
            {peakHz !== null ? formatFrequency(peakHz) : '—'}
          </span>
        </div>
        <div className="glass-panel p-4">
          <span className="text-xs text-gray-500 block">Relative Amplitude</span>
          <span className="text-lg font-mono font-semibold text-accent-purple">
            {Number.isFinite(rmsDbfs) ? `${rmsDbfs.toFixed(1)} dBFS` : '−∞ dBFS'}
          </span>
        </div>
        <div className="glass-panel p-4">
          <span className="text-xs text-gray-500 block">Engine State</span>
          <span
            className={`text-lg font-mono font-semibold capitalize ${
              isPlaying ? 'text-accent-green' : 'text-gray-500'
            }`}
          >
            {snap.status}
          </span>
        </div>
      </div>

      {/* Large visualisers */}
      <div className="glass-panel p-5 space-y-6">
        <WaveformDisplay
          isActive={isPlaying}
          height={210}
          color="#4f8fff"
          label="Oscilloscope (Zero-Crossing Triggered)"
        />
        <SpectrumDisplay
          isActive={isPlaying}
          height={220}
          markerFrequency={state.tinnitusProfile?.frequency}
          label="Frequency Spectrum (Purple line = Saved Tinnitus Pitch)"
        />
      </div>

      {/* Quick Test Signal Generator */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Quick Test Signal</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTestMode('tone')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                testMode === 'tone'
                  ? 'bg-accent-blue text-white'
                  : 'bg-surface-700 text-gray-400 hover:text-white'
              }`}
            >
              Tone
            </button>
            <button
              onClick={() => setTestMode('noise')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                testMode === 'noise'
                  ? 'bg-accent-cyan text-white'
                  : 'bg-surface-700 text-gray-400 hover:text-white'
              }`}
            >
              Noise
            </button>
          </div>
        </div>

        {testMode === 'tone' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(['sine', 'triangle', 'square', 'sawtooth'] as WaveformType[]).map((wf) => (
                <button
                  key={wf}
                  onClick={() => setWaveform(wf)}
                  className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-all ${
                    waveform === wf
                      ? 'bg-accent-blue/80 text-white'
                      : 'bg-surface-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {wf}
                </button>
              ))}
            </div>
            <FrequencyControl frequency={frequency} onChange={setFrequency} />
          </div>
        ) : (
          <div className="flex gap-2">
            {(['white', 'pink', 'brown'] as NoiseColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setNoiseColor(c)}
                className={`px-4 py-1.5 text-xs rounded-lg capitalize transition-all ${
                  noiseColor === c
                    ? 'bg-accent-cyan text-white'
                    : 'bg-surface-700 text-gray-400 hover:text-white'
                }`}
              >
                {c} noise
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          {isPlaying && isVisualiserSource ? (
            <button
              onClick={() => engine.stop(0.05)}
              className="btn-danger text-sm flex items-center gap-2"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop Test Signal
            </button>
          ) : (
            <button
              onClick={startTestSignal}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Generate Test Signal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
