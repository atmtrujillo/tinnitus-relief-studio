import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine, type EngineSnapshot } from '../audio';

/** Subscribe reactively to AudioEngine snapshots without polling. */
export function useEngine(): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

/** Returns elapsed playback seconds for the current/most recent program. */
export function useElapsedSeconds(): number {
  const snap = useEngine();
  const [seconds, setSeconds] = useState(() => Math.floor(engine.elapsedMs() / 1000));

  useEffect(() => {
    setSeconds(Math.floor(engine.elapsedMs() / 1000));
    if (snap.status !== 'playing') return;
    const id = window.setInterval(() => {
      setSeconds(Math.floor(engine.elapsedMs() / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [snap.status, snap.playStartedAt, snap.accumulatedMs]);

  return seconds;
}

/** Keyboard shortcut: Escape triggers immediate audio stop (panic). */
export function usePanicHotkey() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        engine.panic();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
