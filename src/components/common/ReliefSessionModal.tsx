import { useState, useEffect } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import { useAppContext } from '../../store/AppContext';
import { useEngine } from '../../hooks';
import { engine } from '../../audio';
import { generateId, formatDuration, formatFrequency } from '../../utils';

interface ReliefSessionModalProps {
  open: boolean;
  onClose: () => void;
  initialRatingBefore?: number;
}

export function ReliefSessionModal({
  open,
  onClose,
  initialRatingBefore = 5,
}: ReliefSessionModalProps) {
  const { state, dispatch } = useAppContext();
  const snap = useEngine();

  const sourceInfo = snap.info ?? snap.lastInfo;
  const [technique, setTechnique] = useState(sourceInfo?.technique ?? 'Sound Therapy');
  const [frequency, setFrequency] = useState<number>(
    sourceInfo?.frequency ?? state.tinnitusProfile?.frequency ?? 4000
  );
  const [durationSec, setDurationSec] = useState<number>(() =>
    Math.max(0, Math.round(engine.elapsedMs() / 1000))
  );
  const [ratingBefore, setRatingBefore] = useState(initialRatingBefore);
  const [ratingAfter, setRatingAfter] = useState(initialRatingBefore);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const info = snap.info ?? snap.lastInfo;
    if (info?.technique) setTechnique(info.technique);
    if (info?.frequency != null) setFrequency(Math.round(info.frequency));
    else if (state.tinnitusProfile) setFrequency(Math.round(state.tinnitusProfile.frequency));
    setDurationSec(Math.max(0, Math.round(engine.elapsedMs() / 1000)));
    setRatingBefore(initialRatingBefore);
    setRatingAfter(initialRatingBefore);
  }, [open, snap.info, snap.lastInfo, state.tinnitusProfile, initialRatingBefore]);

  if (!open) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({
      type: 'ADD_SESSION',
      payload: {
        id: generateId(),
        date: new Date().toISOString(),
        technique: technique.trim() || 'Experiment',
        source: sourceInfo?.source ?? 'none',
        frequency: Number.isFinite(frequency) ? frequency : null,
        duration: Math.max(0, durationSec),
        ratingBefore,
        ratingAfter,
        notes: notes.trim(),
      },
    });
    setNotes('');
    onClose();
  };

  const diff = ratingBefore - ratingAfter;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel bg-surface-800 border border-white/10 w-full max-w-lg p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="w-5 h-5 text-accent-purple" />
            <h2 className="text-lg font-semibold text-white">Relief Assessment</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Record your subjective tinnitus intensity before and after listening (0 = not
          noticeable, 10 = very loud/intrusive). Subjective ratings are for personal
          tracking only and are not evidence of medical efficacy.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Technique</label>
              <input
                type="text"
                value={technique}
                onChange={(e) => setTechnique(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Frequency ({formatFrequency(frequency)})
              </label>
              <input
                type="number"
                min={20}
                max={20000}
                value={frequency}
                onChange={(e) => setFrequency(parseInt(e.target.value, 10) || 0)}
                className="input-field text-sm font-mono"
              />
            </div>
          </div>

          <div className="text-xs text-gray-400 flex items-center justify-between bg-surface-900/60 px-3 py-2 rounded-lg border border-white/5">
            <span>Recorded listening duration</span>
            <span className="font-mono text-gray-200">{formatDuration(durationSec)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-gray-400">Before Session</span>
                <span className="font-mono font-semibold text-amber-300">{ratingBefore} / 10</span>
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

            <div className="bg-surface-900/60 p-3 rounded-lg border border-white/5">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-gray-400">After Session</span>
                <span className="font-mono font-semibold text-accent-green">{ratingAfter} / 10</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={ratingAfter}
                onChange={(e) => setRatingAfter(parseInt(e.target.value, 10))}
                className="slider-track"
              />
            </div>
          </div>

          <div className="text-xs text-center font-mono text-gray-400">
            Subjective change:{' '}
            <span
              className={
                diff > 0
                  ? 'text-accent-green'
                  : diff < 0
                  ? 'text-red-400'
                  : 'text-gray-300'
              }
            >
              {diff > 0 ? `−${diff} (less noticeable)` : diff < 0 ? `+${Math.abs(diff)} (more noticeable)` : '0 (no change)'}
            </span>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Optional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Environment, headphones used, how it felt..."
              className="input-field h-20 resize-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm">
              Save Assessment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
