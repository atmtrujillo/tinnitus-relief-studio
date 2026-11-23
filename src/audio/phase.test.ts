import { describe, it, expect, vi } from 'vitest';
import { buildPhase, phaseDelays } from './phase';

function makeAudioParam(initial = 0) {
  return {
    value: initial,
    setTargetAtTime: vi.fn(function (this: { value: number }, v: number) {
      this.value = v;
    }),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  } as unknown as AudioParam;
}

describe('Phase inversion DSP (phase.ts)', () => {
  it('phaseDelays is symmetric at 0° and continuous across 0° without cycle jumps', () => {
    const f = 1000; // period = 1 ms
    const zero = phaseDelays(f, 0);
    expect(zero.delayA).toBeCloseTo(0.0005, 8);
    expect(zero.delayB).toBeCloseTo(0.0005, 8);
    expect(zero.delayA).toBe(zero.delayB);

    const neg1 = phaseDelays(f, -1);
    const pos1 = phaseDelays(f, 1);
    // Moving from -1° to +1° should change delayB by 2/360 of a period (≈ 5.56 µs), NOT nearly a full period
    expect(Math.abs(pos1.delayB - neg1.delayB)).toBeCloseTo(2 / 360 / f, 8);
    expect(Math.abs(zero.delayB - neg1.delayB)).toBeLessThan(0.00001);

    const neg180 = phaseDelays(f, -180);
    const pos180 = phaseDelays(f, 180);
    expect(neg180.delayB).toBeCloseTo(0, 8);
    expect(pos180.delayB).toBeCloseTo(1 / f, 8);
  });

  it('phaseDelays stays well within DelayNode max (1s) even at 20 Hz +180°', () => {
    const extreme = phaseDelays(20, 180);
    expect(extreme.delayA).toBeCloseTo(0.025, 6);
    expect(extreme.delayB).toBeCloseTo(0.05, 6);
    expect(extreme.delayB).toBeLessThan(1);
  });

  it('buildPhase clamps frequency to Nyquist on low-sample-rate devices and measures Δφ accurately', () => {
    const oscFrequencies: number[] = [];
    let analyserIdx = 0;
    const sampleA = new Float32Array(2048);
    const sampleB = new Float32Array(2048);

    const makeNode = () => {
      const node: Record<string, unknown> = {
        connect: vi.fn((dest: unknown) => dest),
        disconnect: vi.fn(),
      };
      return node;
    };

    const ctx = {
      sampleRate: 16000, // e.g., Bluetooth HFP headset -> Nyquist = 8000 Hz
      currentTime: 0,
      createOscillator: vi.fn(() => {
        const freq = makeAudioParam(440);
        const origSetTarget = freq.setTargetAtTime;
        freq.setTargetAtTime = vi.fn((v: number, t: number, tc: number) => {
          oscFrequencies.push(v);
          origSetTarget.call(freq, v, t, tc);
          return freq;
        });
        return {
          ...makeNode(),
          type: 'sine',
          frequency: freq,
          start: vi.fn(),
          stop: vi.fn(),
        };
      }),
      createGain: vi.fn(() => ({ ...makeNode(), gain: makeAudioParam(1) })),
      createDelay: vi.fn(() => ({ ...makeNode(), delayTime: makeAudioParam(0) })),
      createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeAudioParam(0) })),
      createAnalyser: vi.fn(() => {
        const idx = analyserIdx++;
        return {
          ...makeNode(),
          fftSize: 2048,
          smoothingTimeConstant: 0,
          getFloatTimeDomainData: vi.fn((out: Float32Array) => {
            out.set(idx === 0 ? sampleA : sampleB);
          }),
        };
      }),
    } as unknown as AudioContext;

    const out = makeNode() as unknown as AudioNode;
    const handle = buildPhase(ctx, out, {
      frequency: 15000, // exceeds 8000 Hz Nyquist!
      waveform: 'sine',
      levelA: 0.5,
      levelB: 0.5,
      mode: 'sum',
      offsetDeg: 0,
    });

    // Clamped to sampleRate / 2 - 50 = 7950 Hz
    expect(oscFrequencies[0]).toBe(7950);

    // Silent buffers -> null
    expect(handle.measurePhaseDeg()).toBeNull();

    // Exact 180° inverted sine waves -> 180°
    for (let i = 0; i < 2048; i++) {
      const s = Math.sin((2 * Math.PI * 16 * i) / 2048);
      sampleA[i] = s;
      sampleB[i] = -s;
    }
    expect(handle.measurePhaseDeg()).toBeCloseTo(180, 3);

    // 90° quadrature -> 90°
    for (let i = 0; i < 2048; i++) {
      sampleA[i] = Math.sin((2 * Math.PI * 16 * i) / 2048);
      sampleB[i] = Math.cos((2 * Math.PI * 16 * i) / 2048);
    }
    expect(handle.measurePhaseDeg()).toBeCloseTo(90, 2);

    // In-phase -> 0°
    for (let i = 0; i < 2048; i++) {
      const s = Math.sin((2 * Math.PI * 16 * i) / 2048);
      sampleA[i] = s;
      sampleB[i] = s;
    }
    expect(handle.measurePhaseDeg()).toBeCloseTo(0, 3);

    handle.stop(0);
    handle.dispose();
  });
});
