import {
  Target,
  FlipHorizontal,
  Music2,
  Activity,
  Clock,
  TrendingDown,
  Waves,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { useEngine } from '../hooks';
import { formatFrequency, formatDate } from '../utils';
import { SafetyBanner } from '../components/common';
import { WaveformDisplay, SpectrumDisplay } from '../components/visualizer';

interface DashboardProps {
  onOpenReliefLog: () => void;
}

export function Dashboard({ onOpenReliefLog }: DashboardProps) {
  const { state } = useAppContext();
  const snap = useEngine();
  const lastSession = state.sessions[state.sessions.length - 1];
  const avgImprovement =
    state.sessions.length > 0
      ? state.sessions.reduce((sum, s) => sum + (s.ratingBefore - s.ratingAfter), 0) /
        state.sessions.length
      : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personalised tinnitus sound therapy & acoustic experimentation studio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenReliefLog}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4 text-accent-purple" />
            Log Relief Session
          </button>
          <Waves className="w-8 h-8 text-accent-blue/40 hidden sm:block" />
        </div>
      </div>

      <SafetyBanner />

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-accent-blue/10 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-accent-blue" />
            </div>
            <span className="text-sm text-gray-400">Calibrated Pitch</span>
          </div>
          <p className="text-xl font-mono font-semibold text-white">
            {state.tinnitusProfile
              ? formatFrequency(state.tinnitusProfile.frequency)
              : 'Not calibrated'}
          </p>
          {state.tinnitusProfile && (
            <p className="text-xs text-gray-500 mt-0.5 capitalize">
              {state.tinnitusProfile.soundType} · {state.tinnitusProfile.ear} ear
            </p>
          )}
        </div>

        <div className="glass-panel p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-accent-purple/10 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-accent-purple" />
            </div>
            <span className="text-sm text-gray-400">Recorded Sessions</span>
          </div>
          <p className="text-xl font-mono font-semibold text-white">
            {state.sessions.length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">stored locally in browser</p>
        </div>

        <div className="glass-panel p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-accent-green/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-accent-green" />
            </div>
            <span className="text-sm text-gray-400">Avg. Rating Delta</span>
          </div>
          <p className="text-xl font-mono font-semibold text-white">
            {avgImprovement !== null
              ? avgImprovement > 0
                ? `−${avgImprovement.toFixed(1)}`
                : avgImprovement < 0
                ? `+${Math.abs(avgImprovement).toFixed(1)}`
                : '0.0'
              : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">subjective 0–10 scale</p>
        </div>

        <div className="glass-panel p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-accent-cyan/10 rounded-lg flex items-center justify-center">
              <Music2 className="w-4 h-4 text-accent-cyan" />
            </div>
            <span className="text-sm text-gray-400">Saved Presets</span>
          </div>
          <p className="text-xl font-mono font-semibold text-white">
            {state.presets.length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">custom therapy mixes</p>
        </div>
      </div>

      {/* Live audio monitor when active */}
      {snap.status !== 'idle' && (
        <div className="glass-panel p-4 space-y-4 border border-accent-blue/20">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-accent-blue font-semibold">
              Live Output Monitor — {snap.info?.label}
            </span>
            <Link to="/visualiser" className="text-xs text-gray-400 hover:text-white">
              Open full visualiser →
            </Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WaveformDisplay isActive={snap.status === 'playing'} height={110} label="Waveform" />
            <SpectrumDisplay
              isActive={snap.status === 'playing'}
              height={110}
              markerFrequency={state.tinnitusProfile?.frequency}
              label="Spectrum"
            />
          </div>
        </div>
      )}

      {/* Workspace modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/calibration"
          className="glass-panel p-5 hover:border-accent-blue/30 transition-all duration-200 group"
        >
          <Target className="w-7 h-7 text-accent-blue mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-white mb-1">1. Tinnitus Calibration</h3>
          <p className="text-sm text-gray-400">
            Sweep or fine-tune pure tones and narrowband noise in 1 Hz steps to match your
            perceived tinnitus pitch.
          </p>
        </Link>

        <Link
          to="/phase"
          className="glass-panel p-5 hover:border-accent-purple/30 transition-all duration-200 group"
        >
          <FlipHorizontal className="w-7 h-7 text-accent-purple mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-white mb-1">2. Phase Inversion Experiment</h3>
          <p className="text-sm text-gray-400">
            Compare 0° and 180° phase-inverted waveforms with dual-trace oscilloscope
            visualisation (experimental).
          </p>
        </Link>

        <Link
          to="/therapy"
          className="glass-panel p-5 hover:border-accent-cyan/30 transition-all duration-200 group"
        >
          <Music2 className="w-7 h-7 text-accent-cyan mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-white mb-1">3. Personalised Sound Therapy</h3>
          <p className="text-sm text-gray-400">
            Layer white, pink, brown, narrowband, and notched noise with custom fade-in,
            balance, and presets.
          </p>
        </Link>

        <Link
          to="/visualiser"
          className="glass-panel p-5 hover:border-accent-green/30 transition-all duration-200 group"
        >
          <Activity className="w-7 h-7 text-accent-green mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-white mb-1">4. Audio Visualiser</h3>
          <p className="text-sm text-gray-400">
            Real-time oscilloscope and 20 Hz – 20 kHz logarithmic spectrum analyser with
            amplitude and peak readouts.
          </p>
        </Link>

        <Link
          to="/history"
          className="glass-panel p-5 hover:border-accent-orange/30 transition-all duration-200 group"
        >
          <Clock className="w-7 h-7 text-accent-orange mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-white mb-1">5. Session History</h3>
          <p className="text-sm text-gray-400">
            Review before/after tinnitus ratings, techniques used, and subjective trends
            over time.
          </p>
        </Link>

        <div className="glass-panel p-5 border-amber-500/15 bg-amber-500/[0.03]">
          <AlertTriangle className="w-7 h-7 text-amber-400 mb-3" />
          <h3 className="font-semibold text-amber-200 mb-1">Scientific & Medical Note</h3>
          <p className="text-xs text-amber-200/70 leading-relaxed">
            Tinnitus Relief Studio is an experimental audio tool, not a clinical hearing
            test or medical device. Acoustic phase cancellation cannot cancel internally
            generated tinnitus. Always keep volume comfortable and below your tinnitus
            level.
          </p>
        </div>
      </div>

      {/* Last session */}
      {lastSession && (
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-400">Most Recent Session</h3>
            <Link to="/history" className="text-xs text-accent-blue hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-500">Date:</span>{' '}
              <span className="text-white">{formatDate(lastSession.date)}</span>
            </div>
            <div>
              <span className="text-gray-500">Technique:</span>{' '}
              <span className="text-white">{lastSession.technique}</span>
            </div>
            {lastSession.frequency != null && (
              <div>
                <span className="text-gray-500">Frequency:</span>{' '}
                <span className="text-white font-mono">{formatFrequency(lastSession.frequency)}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Rating:</span>{' '}
              <span className="font-mono">
                <span className="text-amber-300">{lastSession.ratingBefore}</span>
                <span className="text-gray-500 mx-1">→</span>
                <span className="text-accent-green">{lastSession.ratingAfter}</span>
                <span className="text-gray-500">/10</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
