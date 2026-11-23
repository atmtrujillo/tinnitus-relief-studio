import { describe, it, expect, vi } from 'vitest';
import {
  clamp,
  qFromOctaves,
  bandwidthHz,
  narrowbandMakeup,
  butterworth4,
  hold,
  smoothSquareWave,
} from './nodes';

function makeMockParam(initial = 0, withCancelAndHold = true) {
  const param: Record<string, unknown> = {
    value: initial,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  if (withCancelAndHold) {
    param.cancelAndHoldAtTime = vi.fn();
  }
  return param as unknown as AudioParam;
}

describe('DSP math helpers (nodes.ts)', () => {
  it('clamp restricts values to [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('qFromOctaves converts octave widths to expected linear Q values', () => {
    // 1 octave -> Q = sqrt(2) / 1 ≈ 1.4142
    expect(qFromOctaves(1)).toBeCloseTo(Math.SQRT2, 4);
    // 1/3 octave -> Q ≈ 4.318
    expect(qFromOctaves(1 / 3)).toBeCloseTo(4.3185, 3);
    // Narrower bandwidth produces higher Q
    expect(qFromOctaves(0.1)).toBeGreaterThan(qFromOctaves(0.5));
    expect(qFromOctaves(0.5)).toBeGreaterThan(qFromOctaves(2));
  });

  it('bandwidthHz computes geometrically centred bandwidth', () => {
    // 1 octave around 1000 Hz: [707.1, 1414.2] -> bw ≈ 707.1 Hz
    expect(bandwidthHz(1000, 1)).toBeCloseTo(1000 * (Math.SQRT2 - Math.SQRT1_2), 4);
    // 2 octaves around 1000 Hz: [500, 2000] -> bw = 1500 Hz
    expect(bandwidthHz(1000, 2)).toBeCloseTo(1500, 4);
  });

  it('narrowbandMakeup scales inversely with bandwidth and clamps to [1, 40]', () => {
    const narrow = narrowbandMakeup(48000, 4000, 0.1);
    const wide = narrowbandMakeup(48000, 4000, 1.5);
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(1);
    expect(narrowbandMakeup(48000, 20, 0.02)).toBeLessThanOrEqual(40);
    expect(narrowbandMakeup(48000, 20000, 4)).toBe(1);
  });

  it('butterworth4 configures cascaded biquads with dB-Q values and Nyquist clamping', () => {
    const filters: Array<{
      type: BiquadFilterType;
      Q: AudioParam;
      frequency: AudioParam;
      connect: ReturnType<typeof vi.fn>;
    }> = [];
    const ctx = {
      sampleRate: 48000,
      currentTime: 0,
      createBiquadFilter: vi.fn(() => {
        const f = {
          type: 'lowpass' as BiquadFilterType,
          Q: makeMockParam(0),
          frequency: makeMockParam(350),
          connect: vi.fn(),
        };
        filters.push(f);
        return f;
      }),
    } as unknown as BaseAudioContext;

    const stage = butterworth4(ctx, 'highpass', 30000);
    expect(filters).toHaveLength(2);
    expect(filters[0].type).toBe('highpass');
    expect(filters[1].type).toBe('highpass');
    expect(filters[0].Q.value).toBeCloseTo(20 * Math.log10(0.5412), 4);
    expect(filters[1].Q.value).toBeCloseTo(20 * Math.log10(1.3066), 4);
    // Clamped to sampleRate / 2 - 100 = 23900
    expect(filters[0].frequency.value).toBe(23900);
    expect(filters[1].frequency.value).toBe(23900);
    expect(filters[0].connect).toHaveBeenCalledWith(filters[1]);

    stage.setFrequency(5); // clamped to 10
    expect(filters[0].frequency.setTargetAtTime).toHaveBeenCalledWith(10, 0, 0.02);
  });

  it('hold uses cancelAndHoldAtTime when available and falls back safely on Firefox', () => {
    const pChrome = makeMockParam(0.7, true);
    hold(pChrome, 1.5);
    expect((pChrome as unknown as { cancelAndHoldAtTime: ReturnType<typeof vi.fn> }).cancelAndHoldAtTime).toHaveBeenCalledWith(1.5);

    const pFirefox = makeMockParam(0.7, false);
    hold(pFirefox, 1.5);
    expect(pFirefox.cancelScheduledValues).toHaveBeenCalledWith(1.5);
    expect(pFirefox.setValueAtTime).toHaveBeenCalledWith(0.7, 1.5);
  });

  it('smoothSquareWave builds Lanczos-weighted odd harmonics', () => {
    let capturedImag: Float32Array | null = null;
    const ctx = {
      createPeriodicWave: vi.fn((_real: Float32Array, imag: Float32Array) => {
        capturedImag = imag;
        return {} as PeriodicWave;
      }),
    } as unknown as BaseAudioContext;

    smoothSquareWave(ctx);
    expect(capturedImag).not.toBeNull();
    expect(capturedImag![0]).toBe(0);
    expect(capturedImag![1]).toBeGreaterThan(1.2);
    expect(capturedImag![2]).toBe(0); // even harmonic is zero
    expect(capturedImag![3]).toBeGreaterThan(0);
  });
});
