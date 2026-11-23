import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine, volumeToGain, volumeToDb, MIN_DB, type ProgramHandle } from './AudioEngine';

function createMockAudioContextClass(opts: { delayResume?: Promise<void> } = {}) {
  const instances: Array<{
    state: AudioContextState;
    currentTime: number;
    sampleRate: number;
    baseLatency: number;
    resume: ReturnType<typeof vi.fn>;
    suspend: ReturnType<typeof vi.fn>;
    onstatechange: (() => void) | null;
  }> = [];

  class MockAudioContext {
    state: AudioContextState = 'suspended';
    currentTime = 1.0;
    sampleRate = 48000;
    baseLatency = 0.005;
    destination = { connect: vi.fn(), disconnect: vi.fn() };
    onstatechange: (() => void) | null = null;

    resume = vi.fn(async () => {
      if (opts.delayResume) await opts.delayResume;
      this.state = 'running';
    });

    suspend = vi.fn(async () => {
      this.state = 'suspended';
    });

    constructor() {
      instances.push(this);
    }

    private makeParam(initial = 1) {
      return {
        value: initial,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        cancelAndHoldAtTime: vi.fn(),
      };
    }

    createGain() {
      return {
        gain: this.makeParam(1),
        connect: vi.fn((d: unknown) => d),
        disconnect: vi.fn(),
      };
    }

    createAnalyser() {
      return {
        fftSize: 2048,
        smoothingTimeConstant: 0,
        minDecibels: -100,
        maxDecibels: -30,
        connect: vi.fn((d: unknown) => d),
        disconnect: vi.fn(),
      };
    }

    createDynamicsCompressor() {
      return {
        threshold: this.makeParam(-3),
        knee: this.makeParam(0),
        ratio: this.makeParam(20),
        attack: this.makeParam(0.002),
        release: this.makeParam(0.1),
        connect: vi.fn((d: unknown) => d),
        disconnect: vi.fn(),
      };
    }
  }

  return { MockAudioContext, instances };
}

describe('AudioEngine & volume taper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Provide a minimal browser-like window global for timers and AudioContext lookup
    (globalThis as unknown as { window: unknown }).window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('volumeToGain and volumeToDb follow a 60 dB logarithmic taper', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(-0.5)).toBe(0);
    expect(volumeToGain(1)).toBeCloseTo(1, 6);
    expect(volumeToGain(0.5)).toBeCloseTo(Math.pow(10, -30 / 20), 6);

    expect(volumeToDb(0)).toBe(-Infinity);
    expect(volumeToDb(1)).toBe(0);
    expect(volumeToDb(0.5)).toBe(MIN_DB * 0.5);
  });

  it('setMaxVolume lowers current volume when needed and never raises it', () => {
    const { MockAudioContext } = createMockAudioContextClass();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;

    const eng = new AudioEngine();
    eng.setMasterVolume(0.5);
    expect(eng.getSnapshot().masterVolume).toBe(0.5);

    eng.setMaxVolume(0.3);
    expect(eng.getSnapshot().maxVolume).toBe(0.3);
    expect(eng.getSnapshot().masterVolume).toBe(0.3);

    // Raising the cap must NOT automatically raise current master volume
    eng.setMaxVolume(0.9);
    expect(eng.getSnapshot().maxVolume).toBe(0.9);
    expect(eng.getSnapshot().masterVolume).toBe(0.3);

    // Non-finite or negative values clamp to 0
    eng.setMasterVolume(NaN);
    expect(eng.getSnapshot().masterVolume).toBe(0);
  });

  it('panic() cuts short an active long fade-out immediately', async () => {
    const { MockAudioContext } = createMockAudioContextClass();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;

    const eng = new AudioEngine();
    const stopSpy = vi.fn();
    const disposeSpy = vi.fn();
    const handle: ProgramHandle = { stop: stopSpy, dispose: disposeSpy };

    await eng.start(
      { source: 'therapy', label: 'Therapy: pink noise', technique: 'Sound Therapy', frequency: null },
      () => handle,
      { fadeIn: 0.1, fadeOut: 8 }
    );
    expect(eng.getSnapshot().status).toBe('playing');

    // Stop with 8-second fade-out
    eng.stop(8);
    expect(eng.getSnapshot().status).toBe('idle');
    expect(eng.getSnapshot().isFading).toBe(true);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenLastCalledWith(expect.closeTo(1.0 + 8 + 0.01, 4));
    expect(disposeSpy).not.toHaveBeenCalled();

    // Press panic (Esc) during the 8s fade-out -> must immediately schedule a 10 ms stop & clear isFading
    eng.panic();
    expect(eng.getSnapshot().isFading).toBe(false);
    expect(stopSpy).toHaveBeenCalledTimes(2);
    expect(stopSpy).toHaveBeenLastCalledWith(expect.closeTo(1.0 + 0.01 + 0.005, 4));

    // After ~100 ms, fading program is disposed (not waiting 8 seconds!)
    vi.advanceTimersByTime(150);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts pending start() if panic() or stop() is called while ctx.resume() is awaiting', async () => {
    let resolveResume!: () => void;
    const delayResume = new Promise<void>((r) => {
      resolveResume = r;
    });
    const { MockAudioContext } = createMockAudioContextClass({ delayResume });
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;

    const eng = new AudioEngine();
    const buildSpy = vi.fn(() => ({ stop: vi.fn(), dispose: vi.fn() }));

    const pending = eng.start(
      { source: 'calibration', label: 'Tone', technique: 'Calibration', frequency: 1000 },
      buildSpy
    );

    // User hits Esc before ctx.resume() resolves
    eng.panic();
    resolveResume();

    const result = await pending;
    expect(result).toBeNull();
    expect(buildSpy).not.toHaveBeenCalled();
    expect(eng.getSnapshot().status).toBe('idle');
  });

  it('pauses with a brief de-click fade and resumes cleanly', async () => {
    const { MockAudioContext, instances } = createMockAudioContextClass();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;

    const eng = new AudioEngine();
    await eng.start(
      { source: 'calibration', label: 'Tone', technique: 'Calibration', frequency: 440 },
      () => ({ stop: vi.fn(), dispose: vi.fn() })
    );

    const pausePromise = eng.pause();
    expect(eng.getSnapshot().status).toBe('paused');
    // Suspend happens after the 20 ms de-click window
    expect(instances[0].suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    await pausePromise;
    expect(instances[0].suspend).toHaveBeenCalledTimes(1);

    await eng.resume();
    expect(eng.getSnapshot().status).toBe('playing');
    expect(instances[0].resume).toHaveBeenCalledTimes(2);
  });
});
