import { useState } from 'react';
import { Save, RotateCcw, AlertTriangle, Shield, Cpu, Trash2, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { useEngine } from '../hooks';
import { DEFAULT_SETTINGS } from '../types';
import { VolumeSlider } from '../components/controls';
import { engine } from '../audio';

export function SettingsPage() {
  const { state, dispatch } = useAppContext();
  const snap = useEngine();
  const [settings, setSettings] = useState(state.settings);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const safeDefault = Math.min(settings.defaultVolume, settings.maxVolume);
    const next = { ...settings, defaultVolume: safeDefault };
    setSettings(next);
    dispatch({ type: 'UPDATE_SETTINGS', payload: next });
    engine.setMaxVolume(next.maxVolume);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    dispatch({ type: 'UPDATE_SETTINGS', payload: DEFAULT_SETTINGS });
    engine.setMaxVolume(DEFAULT_SETTINGS.maxVolume);
    engine.setMasterVolume(DEFAULT_SETTINGS.defaultVolume);
  };

  const handleClearData = () => {
    if (window.confirm('Clear your saved tinnitus profile, presets, and session history?')) {
      engine.panic();
      dispatch({ type: 'RESET_ALL' });
      setSettings(DEFAULT_SETTINGS);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure safety limits, visualiser performance, and local browser storage.
        </p>
      </div>

      {/* Audio safety */}
      <div className="glass-panel p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-accent-blue" />
          <h2 className="text-base font-semibold text-white">Audio Safety Limits</h2>
        </div>

        <VolumeSlider
          volume={settings.maxVolume}
          onChange={(v) =>
            setSettings((s) => ({
              ...s,
              maxVolume: Math.max(0.1, v),
              defaultVolume: Math.min(s.defaultVolume, Math.max(0.1, v)),
            }))
          }
          max={1}
          label="Software Master Volume Cap"
        />
        <p className="text-xs text-gray-400">
          Caps the master volume slider across the entire application. Remember that browser
          volume sliders cannot measure or guarantee a safe acoustic sound pressure level
          (dB SPL) at your ears — your OS volume and headphones determine real loudness.
        </p>

        <VolumeSlider
          volume={settings.defaultVolume}
          onChange={(v) => setSettings((s) => ({ ...s, defaultVolume: v }))}
          max={settings.maxVolume}
          label="Default Starting Volume (starts low for safety)"
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Listening Break Reminder</label>
            <span className="text-xs font-mono text-gray-300">
              {settings.breakReminderMinutes === 0
                ? 'Off'
                : `Every ${settings.breakReminderMinutes} min`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={settings.breakReminderMinutes}
            onChange={(e) =>
              setSettings((s) => ({ ...s, breakReminderMinutes: parseInt(e.target.value, 10) }))
            }
            className="slider-track"
          />
        </div>
      </div>

      {/* Visualiser */}
      <div className="glass-panel p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Visualiser Performance</h2>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Target Frame Rate</label>
            <span className="text-xs font-mono text-gray-300">{settings.visualizerFps} fps</span>
          </div>
          <input
            type="range"
            min={15}
            max={60}
            step={5}
            value={settings.visualizerFps}
            onChange={(e) =>
              setSettings((s) => ({ ...s, visualizerFps: parseInt(e.target.value, 10) }))
            }
            className="slider-track"
          />
        </div>
      </div>

      {/* Audio Engine Diagnostics */}
      <div className="glass-panel p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-accent-cyan" />
          <h2 className="text-base font-semibold text-white">Web Audio Diagnostics</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500 block">Web Audio</span>
            <span className={snap.supported ? 'text-accent-green' : 'text-red-400'}>
              {snap.supported ? 'Supported' : 'Unsupported'}
            </span>
          </div>
          <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500 block">Context State</span>
            <span className="text-gray-200">{snap.contextState}</span>
          </div>
          <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500 block">Sample Rate</span>
            <span className="text-gray-200">
              {snap.sampleRate ? `${snap.sampleRate} Hz` : 'Idle'}
            </span>
          </div>
          <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500 block">Base Latency</span>
            <span className="text-gray-200">
              {snap.baseLatency != null ? `${(snap.baseLatency * 1000).toFixed(1)} ms` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Medical & Safety Disclaimer */}
      <div className="glass-panel p-6 space-y-3 border border-amber-500/20 bg-amber-500/[0.03]">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-semibold text-amber-200">Safety & Scientific Notice</h2>
        </div>
        <div className="text-xs text-gray-300/80 space-y-2 leading-relaxed">
          <p>
            Tinnitus Relief Studio is an experimental sound-generation tool running locally in
            your browser, provided at your own risk with no guarantee of relief. It is{' '}
            <strong className="text-white">not a medical device or clinical hearing test</strong>{' '}
            and does not diagnose, treat, cure, or prevent tinnitus or hearing loss.
          </p>
          <p>
            Conventional acoustic phase cancellation operates on physical sound waves in air
            and cannot cancel internally generated tinnitus perception, and clinical evidence
            for notched sound therapy is mixed. Always keep playback at a low, comfortable
            volume (never loud, even if your tinnitus feels loud), and stop immediately
            (<strong>Stop</strong> or <code className="text-gray-200">Esc</code>) if any sound
            causes discomfort, pain, hyperacusis, or worsens your tinnitus.
          </p>
          <p>
            Consult an audiologist or healthcare professional for tinnitus concerns —
            especially if your tinnitus is sudden in onset, one-sided (unilateral), pulsatile
            (rhythmic/heartbeat-like), or accompanied by hearing loss, ear pain, or
            dizziness/vertigo.
          </p>
        </div>
      </div>

      {/* Save / Reset / Clear */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleSave} className="btn-primary text-sm flex items-center gap-2">
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
        <button onClick={handleReset} className="btn-secondary text-sm flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Reset Defaults
        </button>
        <button
          onClick={handleClearData}
          className="btn-secondary text-sm flex items-center gap-2 text-red-400 hover:text-red-300 ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          Clear All Local Data
        </button>
      </div>
    </div>
  );
}
