import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export function SafetyBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-amber-200 font-medium">Audio Safety Notice</p>
        <p className="text-xs text-amber-200/70 mt-1">
          Start at a low volume and increase gradually. This application cannot measure
          actual sound pressure levels from your headphones. Never listen at levels that
          cause discomfort. Take regular breaks. This is not a medical device.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400/60 hover:text-amber-400 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
