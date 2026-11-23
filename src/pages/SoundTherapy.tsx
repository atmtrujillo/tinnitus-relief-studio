import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  Save,
  Trash2,
  Plus,
  Heart,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { engine, buildTherapy, type TherapyHandle } from '../audio';
import { useAppContext } from '../store/AppContext';
import { useEngine, useElapsedSeconds } from '../hooks';
import { FrequencyControl, VolumeSlider } from '../components/controls';
import { WaveformDisplay, SpectrumDisplay } from '../components/visualizer';
import { SafetyBanner, ReliefSessionModal } from '../components/common';
import { generateId, formatFrequency, formatDuration } from '../utils';
import type { LayerKind, NoiseColor, TherapyLayer, TherapyPreset, WaveformType } from '../types';

function makeLayer(kind: LayerKind, tinnitusFreq: number): TherapyLayer {
  return {
    id: generateId(),
    kind,
    enabled: true,
    color: kind === 'notched' ? 'pink' : 'pink',
    frequency: tinnitusFreq,
    bandwidthOct: kind === 'notched' ? 0.5 : 0.35,
    waveform: 'sine',
    level: kind === 'tone' ? 0.25 : 0.5,
    pan: 0,
  };
}

export function SoundTherapy() {
  const { state, dispatch } = useAppContext();
  const snap = useEngine();
  const elapsed = useElapsedSeconds();
  const baseFreq = state.tinnitusProfile?.frequency ?? 4000;

  const [layers, setLayers] = useState<TherapyLayer[]>(() => [
    makeLayer('noise', baseFreq),
  ]);
  const [fadeIn, setFadeIn] = useState(1.5);
  const [fadeOut, setFadeOut] = useState(1.5);
  const [presetName, setPresetName] = useState('');

  // Before-session rating & post-session modal
  const [ratingBefore, setRatingBefore] = useState(5);
  const [showPostModal, setShowPostModal] = useState(false);

  const isThisPlaying = snap.status === 'playing' && snap.info?.source === 'therapy';
  const isThisActive = snap.status !== 'idle' && snap.info?.source === 'therapy';

  // Live-update therapy layers whenever they change while playing
  useEffect(() => {
    const h = engine.getHandle<TherapyHandle>('therapy');
    if (!h) return;
    h.update({ layers });
  }, [layers]);

  const describeMix = useCallback((list: TherapyLayer[]) => {
    const active = list.filter((l) => l.enabled);
    if (active.length === 0) return 'Custom Mix';
    return active
      .map((l) =>
        l.kind === 'noise'
          ? `${l.color} noise`
          : l.kind === 'narrowband'
          ? `narrowband ${formatFrequency(l.frequency)}`
          : l.kind === 'notched'
          ? `notched ${l.color}`
          : `${l.waveform} ${formatFrequency(l.frequency)}`
      )
      .join(' + ');
  }, []);

  const handlePlay = useCallback(async () => {
    const label = describeMix(layers);
    const primaryFreq =
      layers.find((l) => l.enabled && l.kind !== 'noise')?.frequency ??
      state.tinnitusProfile?.frequency ??
      null;

    await engine.start(
      {
        source: 'therapy',
        label: `Therapy: ${label}`,
        technique: `Sound Therapy (${label})`,
        frequency: primaryFreq,
      },
      (ctx, out) => buildTherapy(ctx, out, { layers }),
      { fadeIn, fadeOut }
    );
  }, [layers, fadeIn, fadeOut, describeMix, state.tinnitusProfile]);

  const handleStop = useCallback(() => {
    const hadSession = engine.elapsedMs() >= 5000;
    engine.stop(fadeOut);
    if (hadSession) {
      setShowPostModal(true);
    }
  }, [fadeOut]);

  const updateLayer = (id: string, patch: Partial<TherapyLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLayer = (kind: LayerKind) => {
    setLayers((prev) => [...prev, makeLayer(kind, baseFreq)]);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const applyStarter = (kind: 'pink' | 'brown' | 'white' | 'narrowband' | 'notched' | 'combo') => {
    if (kind === 'pink' || kind === 'brown' || kind === 'white') {
      setLayers([{ ...makeLayer('noise', baseFreq), color: kind, level: 0.55 }]);
    } else if (kind === 'narrowband') {
      setLayers([makeLayer('narrowband', baseFreq)]);
    } else if (kind === 'notched') {
      setLayers([makeLayer('notched', baseFreq)]);
    } else {
      setLayers([
        { ...makeLayer('noise', baseFreq), color: 'brown', level: 0.45 },
        { ...makeLayer('narrowband', baseFreq), level: 0.35 },
      ]);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const preset: TherapyPreset = {
      id: generateId(),
      name: presetName.trim(),
      layers: layers.map((l) => ({ ...l })),
      fadeIn,
      fadeOut,
      savedAt: new Date().toISOString(),
    };
    dispatch({ type: 'SAVE_PRESET', payload: preset });
    setPresetName('');
  };

  const handleLoadPreset = (preset: TherapyPreset) => {
    setLayers(preset.layers.map((l) => ({ ...l })));
    setFadeIn(preset.fadeIn);
    setFadeOut(preset.fadeOut);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Personalised Sound Therapy</h1>
          <p className="text-sm text-gray-400 mt-1">
            Combine coloured noise, narrowband masking, notched noise, and pure tones with
            live balance and fade controls.
          </p>
        </div>
        {isThisActive && (
          <div className="px-3 py-1.5 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30 text-sm font-mono text-accent-cyan">
            Session: {formatDuration(elapsed)}
          </div>
        )}
      </div>

      <SafetyBanner />

      {/* Quick Starters */}
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent-cyan" />
            Quick Profiles (centred on {formatFrequency(baseFreq)})
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'pink' as const, label: 'Pink Noise' },
            { id: 'brown' as const, label: 'Brown Noise' },
            { id: 'white' as const, label: 'White Noise' },
            { id: 'narrowband' as const, label: 'Narrowband Masker' },
            { id: 'notched' as const, label: 'Notched Pink Noise' },
            { id: 'combo' as const, label: 'Brown + Narrowband Mix' },
          ].map((q) => (
            <button
              key={q.id}
              onClick={() => applyStarter(q.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pre-session intensity check + Transport */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">Before-Session Tinnitus Rating</span>
            <span className="font-mono text-amber-300 font-semibold">{ratingBefore} / 10</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={ratingBefore}
            onChange={(e) => setRatingBefore(parseInt(e.target.value, 10))}
            className="slider-track"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs">
            <div>
              <label className="text-gray-500 block">Fade In ({fadeIn}s)</label>
              <input
                type="range"
                min={0.1}
                max={8}
                step={0.1}
                value={fadeIn}
                onChange={(e) => setFadeIn(parseFloat(e.target.value))}
                className="slider-track w-24"
              />
            </div>
            <div>
              <label className="text-gray-500 block">Fade Out ({fadeOut}s)</label>
              <input
                type="range"
                min={0.1}
                max={8}
                step={0.1}
                value={fadeOut}
                onChange={(e) => setFadeOut(parseFloat(e.target.value))}
                className="slider-track w-24"
              />
            </div>
          </div>

          {isThisActive ? (
            <button onClick={handleStop} className="btn-danger flex items-center gap-2 text-sm">
              <Square className="w-4 h-4 fill-current" />
              Stop & Rate
            </button>
          ) : (
            <button onClick={handlePlay} className="btn-primary flex items-center gap-2 text-sm">
              <Play className="w-4 h-4" />
              Start Therapy
            </button>
          )}
        </div>
      </div>

      {/* Sound Layers */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-cyan" />
            Sound Layers ({layers.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {([
              { kind: 'noise' as LayerKind, label: '+ Noise' },
              { kind: 'narrowband' as LayerKind, label: '+ Narrowband' },
              { kind: 'notched' as LayerKind, label: '+ Notched' },
              { kind: 'tone' as LayerKind, label: '+ Tone' },
            ]).map((btn) => (
              <button
                key={btn.kind}
                onClick={() => addLayer(btn.kind)}
                className="px-2.5 py-1 text-xs rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-accent-cyan" />
                {btn.label.slice(2)}
              </button>
            ))}
          </div>
        </div>

        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`glass-panel p-5 space-y-4 transition-opacity ${
              layer.enabled ? '' : 'opacity-50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={layer.enabled}
                  onChange={(e) => updateLayer(layer.id, { enabled: e.target.checked })}
                  className="w-4 h-4 accent-cyan-500 rounded"
                  aria-label={`Enable layer ${index + 1}`}
                />
                <span className="text-sm font-semibold text-white">Layer {index + 1}</span>
                <select
                  value={layer.kind}
                  onChange={(e) => updateLayer(layer.id, { kind: e.target.value as LayerKind })}
                  className="bg-surface-700 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-gray-200"
                >
                  <option value="noise">Broadband Noise</option>
                  <option value="narrowband">Narrowband Noise</option>
                  <option value="notched">Notched Noise</option>
                  <option value="tone">Pure Tone</option>
                </select>

                {(layer.kind === 'noise' || layer.kind === 'notched') && (
                  <div className="flex gap-1">
                    {(['white', 'pink', 'brown'] as NoiseColor[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => updateLayer(layer.id, { color: c })}
                        className={`px-2.5 py-1 text-xs rounded-md capitalize transition-all ${
                          layer.color === c
                            ? 'bg-accent-cyan text-white'
                            : 'bg-surface-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {layer.kind === 'tone' && (
                  <div className="flex gap-1">
                    {(['sine', 'triangle', 'square', 'sawtooth'] as WaveformType[]).map((wf) => (
                      <button
                        key={wf}
                        onClick={() => updateLayer(layer.id, { waveform: wf })}
                        className={`px-2.5 py-1 text-xs rounded-md capitalize transition-all ${
                          layer.waveform === wf
                            ? 'bg-accent-blue text-white'
                            : 'bg-surface-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {wf}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {layers.length > 1 && (
                <button
                  onClick={() => removeLayer(layer.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  title="Remove layer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {layer.kind !== 'noise' && (
              <FrequencyControl
                frequency={layer.frequency}
                onChange={(f) => updateLayer(layer.id, { frequency: f })}
                label={
                  layer.kind === 'notched'
                    ? 'Notch Centre Frequency'
                    : layer.kind === 'narrowband'
                    ? 'Band Centre Frequency'
                    : 'Tone Frequency'
                }
              />
            )}

            {(layer.kind === 'narrowband' || layer.kind === 'notched') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">
                    {layer.kind === 'notched' ? 'Notch Width' : 'Bandwidth'}
                  </label>
                  <span className="text-xs font-mono text-gray-300">
                    {layer.bandwidthOct.toFixed(2)} octaves
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={2.0}
                  step={0.05}
                  value={layer.bandwidthOct}
                  onChange={(e) =>
                    updateLayer(layer.id, { bandwidthOct: parseFloat(e.target.value) })
                  }
                  className="slider-track"
                />
                {layer.kind === 'notched' && (
                  <p className="text-[11px] text-amber-200/70 mt-1.5">
                    Experimental: clinical evidence for notched sound therapy is mixed; treat
                    it as an exploratory listening option rather than a validated treatment.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VolumeSlider
                volume={layer.level}
                onChange={(v) => updateLayer(layer.id, { level: v })}
                max={1}
                label="Layer Level"
              />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Stereo Balance</span>
                  <span className="text-xs font-mono text-gray-300">
                    {layer.pan === 0
                      ? 'Center'
                      : layer.pan < 0
                      ? `${Math.round(Math.abs(layer.pan) * 100)}% L`
                      : `${Math.round(layer.pan * 100)}% R`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={layer.pan}
                  onChange={(e) => updateLayer(layer.id, { pan: parseFloat(e.target.value) })}
                  className="slider-track"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save Favourite Preset */}
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Name this configuration to save as favourite..."
            className="input-field flex-1 text-sm"
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            Save Favourite
          </button>
        </div>

        {state.presets.length > 0 && (
          <div className="pt-2 border-t border-white/5 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-accent-purple" />
              Saved Configurations
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {state.presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between p-3 bg-surface-700/80 rounded-lg border border-white/5"
                >
                  <button
                    onClick={() => handleLoadPreset(preset)}
                    className="text-left flex-1 min-w-0"
                  >
                    <span className="text-sm text-white font-medium block truncate">
                      {preset.name}
                    </span>
                    <span className="text-xs text-gray-400 block truncate">
                      {preset.layers.length} layer{preset.layers.length === 1 ? '' : 's'} · Fade{' '}
                      {preset.fadeIn}s/{preset.fadeOut}s
                    </span>
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_PRESET', payload: preset.id })}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    title="Delete preset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Visualisations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <WaveformDisplay isActive={isThisPlaying} height={140} color="#06b6d4" label="Waveform" />
        </div>
        <div className="glass-panel p-4">
          <SpectrumDisplay
            isActive={isThisPlaying}
            height={140}
            markerFrequency={state.tinnitusProfile?.frequency}
            label="Spectrum"
          />
        </div>
      </div>

      <ReliefSessionModal
        open={showPostModal}
        onClose={() => setShowPostModal(false)}
        initialRatingBefore={ratingBefore}
      />
    </div>
  );
}
