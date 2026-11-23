/**
 * AudioEngine — the single owner of the Web Audio graph.
 *
 * Signal flow:
 *
 *   program bus (per program; carries fade in/out)
 *        │
 *        ▼
 *   mix bus ──► scope analyser ──► spectrum analyser ──► master gain ──► limiter ──► destination
 *
 * Design notes
 * - Only one "program" (calibration, phase experiment, therapy mix, test
 *   signal) plays at a time. Starting a program tears down the previous one,
 *   so a stray oscillator can never keep playing on another page.
 * - Analysers sit BEFORE the master gain so the visualisations show the
 *   signal's shape at any listening level. The output level readout adds
 *   the master gain back in.
 * - The master volume uses a dB taper (see volumeToGain), so low slider
 *   positions are genuinely quiet. It is capped by the user's maxVolume
 *   setting and is never raised automatically.
 * - A brick-wall-style DynamicsCompressor guards against digital clipping
 *   when layers are summed. It is a clipping guard, NOT a hearing-safety
 *   device. The app cannot know the real sound pressure level at the ear.
 * - The engine is a tiny external store (subscribe / getSnapshot), so React
 *   reads it via useSyncExternalStore without re-rendering on audio frames.
 */

import type { SourceKind } from '../types';
import { hold } from './nodes';

export interface ProgramHandle {
  /** Schedule every source node to stop at AudioContext time `when`. */
  stop(when: number): void;
  /** Disconnect every node the program created (called after the fade-out). */
  dispose(): void;
}

export interface ProgramInfo {
  source: SourceKind;
  label: string;
  technique: string;
  frequency: number | null;
}

export type EngineStatus = 'idle' | 'playing' | 'paused';

export interface EngineSnapshot {
  supported: boolean;
  status: EngineStatus;
  isFading: boolean;
  info: ProgramInfo | null;
  lastInfo: ProgramInfo | null;
  masterVolume: number;
  maxVolume: number;
  contextState: string;
  playStartedAt: number | null; // Date.now() when playback last (re)started
  accumulatedMs: number; // played time before the last (re)start
  sampleRate: number | null;
  baseLatency: number | null;
  error: string | null;
}

/** Bottom of the master volume taper. Slider 0..1 maps to MIN_DB..0 dB. */
export const MIN_DB = -60;

export function volumeToGain(v: number): number {
  return v <= 0 ? 0 : Math.pow(10, (MIN_DB * (1 - v)) / 20);
}

export function volumeToDb(v: number): number {
  if (v <= 0) return -Infinity;
  if (v >= 1) return 0;
  return MIN_DB * (1 - v);
}

type Ctor = typeof AudioContext;

function getCtor(): Ctor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext;
}

interface ActiveProgram {
  bus: GainNode;
  handle: ProgramHandle;
  info: ProgramInfo;
  fadeOut: number;
}

interface FadingProgram {
  bus: GainNode;
  handle: ProgramHandle;
  timer: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: GainNode | null = null;
  private scope: AnalyserNode | null = null;
  private spectrum: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private current: ActiveProgram | null = null;
  private fading = new Set<FadingProgram>();
  private listeners = new Set<() => void>();
  private idleTimer: number | undefined;
  private startGen = 0;

  private snapshot: EngineSnapshot = {
    supported: !!getCtor(),
    status: 'idle',
    isFading: false,
    info: null,
    lastInfo: null,
    masterVolume: 0.15,
    maxVolume: 0.8,
    contextState: 'none',
    playStartedAt: null,
    accumulatedMs: 0,
    sampleRate: null,
    baseLatency: null,
    error: null,
  };

  // ---------- external store ----------
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private patch(p: Partial<EngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...p };
    this.listeners.forEach((l) => l());
  }

  get context() {
    return this.ctx;
  }
  get scopeAnalyser() {
    return this.scope;
  }
  get spectrumAnalyser() {
    return this.spectrum;
  }

  // ---------- context lifecycle ----------
  private createContext(): AudioContext {
    const C = getCtor();
    if (!C) throw new Error('The Web Audio API is not supported in this browser.');
    let ctx: AudioContext;
    try {
      ctx = new C({ latencyHint: 'interactive' });
    } catch {
      ctx = new C(); // older Safari: no options bag
    }

    const mix = ctx.createGain();

    // Oscilloscope: no smoothing; 4096 samples ≈ 85 ms at 48 kHz.
    const scope = ctx.createAnalyser();
    scope.fftSize = 4096;
    scope.smoothingTimeConstant = 0;

    // Spectrum: 8192-point FFT ≈ 5.9 Hz bins at 48 kHz, enough to see a tone
    // peak precisely across the tinnitus range.
    const spectrum = ctx.createAnalyser();
    spectrum.fftSize = 8192;
    spectrum.smoothingTimeConstant = 0.72;
    spectrum.minDecibels = -140;
    spectrum.maxDecibels = 0;

    const master = ctx.createGain();
    master.gain.value = volumeToGain(this.snapshot.masterVolume);

    // Fast, hard limiter at -3 dBFS to prevent clipping of summed layers.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    // Analysers pass audio through unchanged, so chaining them serially keeps
    // them "pulled" by the graph in every browser.
    mix.connect(scope);
    scope.connect(spectrum);
    spectrum.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    ctx.onstatechange = this.onStateChange;

    this.ctx = ctx;
    this.mix = mix;
    this.scope = scope;
    this.spectrum = spectrum;
    this.master = master;
    this.patch({
      sampleRate: ctx.sampleRate,
      baseLatency: typeof ctx.baseLatency === 'number' ? ctx.baseLatency : null,
      contextState: ctx.state,
    });
    return ctx;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture
   * (click/tap). Browsers block audio started any other way, and this app
   * never autoplays.
   */
  private async ensureRunning(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === 'closed') this.createContext();
    const ctx = this.ctx!;
    window.clearTimeout(this.idleTimer);
    if (ctx.state !== 'running') await ctx.resume();
    this.patch({ contextState: ctx.state, error: null });
    return ctx;
  }

  /** Context state changes not initiated by us (e.g. iOS "interrupted" during a call). */
  private onStateChange = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    const p: Partial<EngineSnapshot> = { contextState: ctx.state };
    if (this.snapshot.status === 'playing' && ctx.state !== 'running') {
      p.status = 'paused';
      p.accumulatedMs = this.elapsedNow();
      p.playStartedAt = null;
    }
    this.patch(p);
  };

  private elapsedNow(): number {
    const s = this.snapshot;
    return s.accumulatedMs + (s.playStartedAt ? Date.now() - s.playStartedAt : 0);
  }

  // ---------- programs ----------
  /**
   * Start a program. `build` receives the context and the node to connect its
   * output to, and returns a handle. Any previously running program is faded
   * out quickly and released.
   */
  async start<H extends ProgramHandle>(
    info: ProgramInfo,
    build: (ctx: AudioContext, out: AudioNode) => H,
    opts: { fadeIn?: number; fadeOut?: number } = {}
  ): Promise<H | null> {
    const gen = ++this.startGen;
    let ctx: AudioContext;
    try {
      ctx = await this.ensureRunning();
    } catch (e) {
      if (gen === this.startGen) {
        this.patch({ error: e instanceof Error ? e.message : 'Unable to start audio.' });
      }
      return null;
    }

    // Abort if stop(), panic(), or another start() happened while awaiting resume().
    if (gen !== this.startGen) return null;

    this.teardown(0.02);

    // Ensure mix bus gain is restored to unity (e.g. after a faded pause).
    const mix = this.mix!;
    hold(mix.gain, ctx.currentTime);
    mix.gain.setValueAtTime(1, ctx.currentTime);

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(mix);

    let handle: H;
    try {
      handle = build(ctx, bus);
    } catch (e) {
      bus.disconnect();
      this.patch({ error: e instanceof Error ? e.message : 'Audio graph error.' });
      return null;
    }

    // Fade the program in from silence (never jump straight to full level).
    const t = ctx.currentTime;
    const fadeIn = Math.max(0.02, opts.fadeIn ?? 0.05);
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + fadeIn);

    this.current = { bus, handle, info, fadeOut: opts.fadeOut ?? 0.12 };
    this.patch({
      status: 'playing',
      info,
      lastInfo: info,
      playStartedAt: Date.now(),
      accumulatedMs: 0,
      error: null,
    });
    return handle;
  }

  /** Fade the current program out, stop its sources and release its nodes. */
  private teardown(fade: number) {
    const cur = this.current;
    const ctx = this.ctx;
    if (!cur || !ctx) return;
    this.current = null;

    if (ctx.state !== 'running') {
      // Rendering is suspended, so a scheduled fade would never progress.
      // Release immediately.
      cur.handle.stop(0);
      cur.handle.dispose();
      try {
        cur.bus.disconnect();
      } catch {
        /* already disconnected */
      }
      return;
    }

    const t = ctx.currentTime;
    const f = Math.max(0.005, fade);
    hold(cur.bus.gain, t);
    cur.bus.gain.linearRampToValueAtTime(0, t + f);
    cur.handle.stop(t + f + 0.01);

    const entry: FadingProgram = {
      bus: cur.bus,
      handle: cur.handle,
      timer: 0,
    };
    entry.timer = window.setTimeout(() => {
      this.fading.delete(entry);
      entry.handle.dispose();
      try {
        entry.bus.disconnect();
      } catch {
        /* already disconnected */
      }
      this.patch({ isFading: this.fading.size > 0 });
    }, (f + 0.1) * 1000);
    this.fading.add(entry);
    this.patch({ isFading: true });
  }

  /** Immediately cut short any programs currently fading out (used by panic). */
  private abortFading(fade = 0.01) {
    if (this.fading.size === 0) return;
    const ctx = this.ctx;
    const entries = Array.from(this.fading);
    this.fading.clear();

    for (const entry of entries) {
      window.clearTimeout(entry.timer);
      if (ctx && ctx.state === 'running') {
        const t = ctx.currentTime;
        const f = Math.max(0.005, fade);
        hold(entry.bus.gain, t);
        entry.bus.gain.linearRampToValueAtTime(0, t + f);
        entry.handle.stop(t + f + 0.005);
        window.setTimeout(() => {
          entry.handle.dispose();
          try {
            entry.bus.disconnect();
          } catch {
            /* already disconnected */
          }
        }, (f + 0.06) * 1000);
      } else {
        entry.handle.stop(0);
        entry.handle.dispose();
        try {
          entry.bus.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    }
    this.patch({ isFading: false });
  }

  /** Stop playback. Uses the program's own fade-out unless one is given. */
  stop(fade?: number) {
    this.startGen++;
    if (!this.current) return;
    const f = fade ?? this.current.fadeOut;
    this.teardown(f);
    this.patch({ status: 'idle', info: null, playStartedAt: null, accumulatedMs: this.elapsedNow() });

    // Suspend the context when idle to save CPU/battery (mobile especially).
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.current && this.fading.size === 0 && this.ctx?.state === 'running') {
        void this.ctx.suspend();
      }
    }, (f + 2) * 1000);
  }

  /** Immediate stop (≈10 ms de-click ramp), including any in-flight fade-outs. */
  panic() {
    this.startGen++;
    this.abortFading(0.01);
    if (this.current) {
      this.stop(0.01);
      // Immediately silence the newly-fading entry on panic as well? No, 10 ms IS the de-click ramp,
      // and `isFading` will clear automatically after ~110 ms.
    } else if (this.ctx?.state === 'running') {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => {
        if (!this.current && this.fading.size === 0 && this.ctx?.state === 'running') {
          void this.ctx.suspend();
        }
      }, 200);
    }
  }

  async pause() {
    if (!this.ctx || this.snapshot.status !== 'playing') return;
    const gen = ++this.startGen;
    this.patch({ status: 'paused', accumulatedMs: this.elapsedNow(), playStartedAt: null });

    // Brief de-click ramp before suspending the AudioContext.
    if (this.mix && this.ctx.state === 'running') {
      const t = this.ctx.currentTime;
      hold(this.mix.gain, t);
      this.mix.gain.linearRampToValueAtTime(0, t + 0.015);
      await new Promise<void>((r) => window.setTimeout(r, 20));
      if (gen !== this.startGen || !this.ctx) return;
    }

    await this.ctx.suspend();
  }

  async resume() {
    if (!this.ctx || this.snapshot.status !== 'paused' || !this.current) return;
    const gen = ++this.startGen;
    try {
      if (this.mix) {
        hold(this.mix.gain, this.ctx.currentTime);
        this.mix.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      await this.ctx.resume();
      if (gen !== this.startGen || !this.ctx || !this.current) return;
      if (this.mix) {
        const t = this.ctx.currentTime;
        this.mix.gain.setValueAtTime(0, t);
        this.mix.gain.linearRampToValueAtTime(1, t + 0.015);
      }
      this.patch({ status: 'playing', playStartedAt: Date.now(), contextState: this.ctx.state });
    } catch (e) {
      if (gen === this.startGen) {
        this.patch({ error: e instanceof Error ? e.message : 'Unable to resume audio.' });
      }
    }
  }

  togglePause() {
    if (this.snapshot.status === 'playing') void this.pause();
    else if (this.snapshot.status === 'paused') void this.resume();
  }

  /** Returns the running program's handle if it belongs to `source`. */
  getHandle<H extends ProgramHandle>(source: SourceKind): H | null {
    return this.current && this.current.info.source === source ? (this.current.handle as H) : null;
  }

  updateInfo(source: SourceKind, patch: Partial<Omit<ProgramInfo, 'source'>>) {
    if (!this.current || this.current.info.source !== source) return;
    const info = { ...this.current.info, ...patch };
    this.current.info = info;
    this.patch({ info, lastInfo: info });
  }

  // ---------- volume ----------
  setMasterVolume(v: number) {
    const value = Math.min(this.snapshot.maxVolume, Math.max(0, Number.isFinite(v) ? v : 0));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(volumeToGain(value), this.ctx.currentTime, 0.02);
    }
    this.patch({ masterVolume: value });
  }

  /** Changing the cap can only lower the current volume, never raise it. */
  setMaxVolume(m: number) {
    const max = Math.min(1, Math.max(0.05, m));
    this.patch({ maxVolume: max });
    if (this.snapshot.masterVolume > max) this.setMasterVolume(max);
  }

  elapsedMs(now = Date.now()): number {
    const s = this.snapshot;
    return s.accumulatedMs + (s.playStartedAt ? now - s.playStartedAt : 0);
  }
}

export const engine = new AudioEngine();
