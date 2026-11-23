import { Pause, Play, Square, Volume2, VolumeX, ClipboardCheck, AlertCircle } from 'lucide-react';
import { engine, volumeToDb } from '../../audio';
import { useEngine, useElapsedSeconds } from '../../hooks';
import { formatDuration, formatFrequency, volumeToPercent } from '../../utils';

interface TransportBarProps {
  onOpenReliefLog: () => void;
}

/**
 * Persistent main audio control bar — accessible across every section.
 * Provides Pause/Resume, immediate Stop (Esc), active source & frequency readout,
 * elapsed time, and the master volume slider with dB taper and safety cap.
 */
export function TransportBar({ onOpenReliefLog }: TransportBarProps) {
  const snap = useEngine();
  const elapsed = useElapsedSeconds();
  const db = volumeToDb(snap.masterVolume);
  const dbText = Number.isFinite(db) ? `${db.toFixed(1)} dB` : '−∞ dB';
  const isPlaying = snap.status === 'playing';
  const isPaused = snap.status === 'paused';
  const isActive = isPlaying || isPaused;

  return (
    <footer className="shrink-0 bg-surface-800/95 backdrop-blur-md border-t border-white/10 px-4 py-2.5">
      {snap.error && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{snap.error}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Transport + Active Program */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => engine.togglePause()}
              disabled={!isActive}
              title={isPlaying ? 'Pause audio' : 'Resume audio'}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-accent-blue hover:bg-accent-blue/80 text-white'
                  : 'bg-surface-700 text-gray-600 cursor-not-allowed'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={() => engine.panic()}
              disabled={!isActive}
              title="Immediate Stop (Esc)"
              className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                isActive
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-600/30'
                  : 'bg-surface-700 text-gray-600 cursor-not-allowed'
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isPlaying
                    ? 'bg-accent-green animate-pulse'
                    : isPaused
                    ? 'bg-amber-400'
                    : 'bg-gray-600'
                }`}
              />
              <span className="text-sm font-medium text-gray-100 truncate">
                {snap.info ? snap.info.label : 'Audio Idle'}
              </span>
              {snap.info?.frequency != null && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue shrink-0">
                  {formatFrequency(snap.info.frequency)}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 font-mono flex items-center gap-2">
              <span>{isActive ? formatDuration(elapsed) : 'No active output'}</span>
              {snap.sampleRate && <span>· {(snap.sampleRate / 1000).toFixed(1)} kHz</span>}
              <span className="hidden sm:inline">· Esc = Panic Stop</span>
            </div>
          </div>
        </div>

        {/* Right: Master Volume + Relief Check */}
        <div className="flex items-center gap-4 flex-1 sm:flex-initial justify-end">
          <div className="flex items-center gap-2.5 w-48 sm:w-60">
            <button
              onClick={() => engine.setMasterVolume(0)}
              title="Mute master volume"
              className="text-gray-400 hover:text-white transition-colors"
            >
              {snap.masterVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-gray-400">Master</span>
                <span className="font-mono text-gray-300">
                  {volumeToPercent(snap.masterVolume)}%{' '}
                  <span className="text-gray-500">({dbText})</span>
                </span>
              </div>
              <input
                type="range"
                aria-label="Master Volume"
                min={0}
                max={snap.maxVolume}
                step={0.01}
                value={snap.masterVolume}
                onChange={(e) => engine.setMasterVolume(parseFloat(e.target.value))}
                className="slider-track"
              />
            </div>
          </div>

          <button
            onClick={onOpenReliefLog}
            className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 border border-white/10 text-xs font-medium text-gray-200 flex items-center gap-1.5 transition-colors shrink-0"
            title="Record a subjective tinnitus relief assessment"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-accent-purple" />
            <span className="hidden md:inline">Log Relief</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
