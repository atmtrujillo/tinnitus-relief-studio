import { Square } from 'lucide-react';
import { engine } from '../../audio';
import { useEngine } from '../../hooks';

export function EmergencyStop() {
  const snap = useEngine();
  const active = snap.status !== 'idle';

  return (
    <button
      onClick={() => engine.panic()}
      aria-label="Immediate stop all audio"
      className={`fixed bottom-20 lg:bottom-6 right-5 z-50 h-12 px-4 rounded-full shadow-lg flex items-center gap-2 font-semibold text-xs tracking-wider uppercase transition-all duration-200 active:scale-95 ${
        active
          ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/35 ring-2 ring-red-400/40'
          : 'bg-surface-700 hover:bg-red-600/80 text-gray-300 hover:text-white border border-white/10'
      }`}
      title="Immediate Stop (Esc) — silence all audio immediately"
    >
      <Square className="w-3.5 h-3.5 fill-current" />
      <span>Stop</span>
    </button>
  );
}
