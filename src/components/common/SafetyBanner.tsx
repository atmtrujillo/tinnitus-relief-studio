import { AlertTriangle, X } from 'lucide-react';
import { useAppContext } from '../../store/AppContext';

export function SafetyBanner() {
  const { state, dispatch } = useAppContext();

  if (state.settings.safetyAcknowledged) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-amber-200 font-medium">Audio Safety Notice</p>
        <p className="text-xs text-amber-200/70 mt-1">
          Start at a low, comfortable volume (never loud, even if your tinnitus feels loud).
          This app cannot measure actual sound pressure levels (dB SPL) from your headphones.
          Stop immediately (<strong>Stop</strong> or <kbd className="px-1 py-0.5 rounded bg-amber-500/20 font-mono text-[10px]">Esc</kbd>) if any sound causes discomfort, triggers sound
          sensitivity (hyperacusis), or worsens your tinnitus. Take regular breaks. This is
          an experimental tool, not a medical device.
        </p>
      </div>
      <button
        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', payload: { safetyAcknowledged: true } })}
        aria-label="Acknowledge and dismiss safety notice"
        className="text-amber-400/60 hover:text-amber-400 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
