/**
 * Phase-inversion experiment.
 *
 * One oscillator feeds two paths, so the signals are phase-locked by
 * construction (two separate oscillators would drift relative to each other):
 *
 *   osc ─► tapA (level A) ─┬─► analyser A
 *                          └─► modeA ─► panA ─► out
 *   osc ─► polarity (×−1) ─► delay (fine offset) ─► tapB (level B) ─┬─► analyser B
 *                                                                   └─► modeB ─► panB ─► out
 *
 * - Polarity inversion: multiplying by −1 (a GainNode with gain −1) is an
 *   exact 180° shift of every frequency component for any waveform.
 * - The optional extra offset is a time delay of (offset/360)/f seconds, i.e.
 *   a fraction of one period. That shifts a periodic waveform by `offset`
 *   degrees relative to its fundamental.
 *
 * Modes:
 *   normal   → only A (0°)
 *   inverted → only B (180° + offset)
 *   sum      → A + B mixed centrally. Equal levels and 0 offset cancel to
 *              digital silence (destructive interference).
 *   dichotic → A in the left ear, B in the right. The signals never mix
 *              acoustically, so no cancellation occurs.
 *
 * Analysers tap the signals BEFORE the mode switch, so both waveforms are
 * always visible for comparison.
 */

import type { WaveformType } from '../types';
import type { ProgramHandle } from './AudioEngine';
import { clamp, createPanner, disconnectAll, safeStop, smooth } from './nodes';

export type PhaseMode = 'normal' | 'inverted' | 'sum' | 'dichotic';

export interface PhaseParams {
  frequency: number;
  waveform: WaveformType;
  levelA: number;
  levelB: number;
  mode: PhaseMode;
  offsetDeg: number; // extra shift applied to B on top of the inversion (−180..180)
}

export interface PhaseHandle extends ProgramHandle {
  update(p: PhaseParams): void;
  analyserA: AnalyserNode;
  analyserB: AnalyserNode;
  /**
   * Phase difference between A and B estimated from their normalised
   * cross-correlation at lag 0: cos Δφ = Σab / √(Σa²·Σb²). Returns 0..180°,
   * or null if a signal is silent.
   */
  measurePhaseDeg(): number | null;
}

const HEADROOM = 0.5;

/**
 * Symmetric sub-period delays for paths A and B so fine phase offsets across
 * [-180°, +180°] vary continuously through 0° without jumping a full cycle.
 * At offsetDeg = 0, both paths share the exact same half-period delay so
 * A + B cancels to digital silence.
 */
export function phaseDelays(freq: number, offsetDeg: number): { delayA: number; delayB: number } {
  const f = Math.max(20, freq);
  const clampedOffset = clamp(offsetDeg, -180, 180);
  return {
    delayA: 0.5 / f,
    delayB: (0.5 + clampedOffset / 360) / f,
  };
}

export function buildPhase(ctx: AudioContext, out: AudioNode, initial: PhaseParams): PhaseHandle {
  let p = { ...initial };
  const nyquistSafe = Math.min(20000, Math.max(20, ctx.sampleRate / 2 - 50));
  const f0 = clamp(p.frequency, 20, nyquistSafe);
  const initDelays = phaseDelays(f0, p.offsetDeg);

  const osc = ctx.createOscillator();
  osc.type = p.waveform;
  osc.frequency.value = f0;

  // Path A: original phase (with symmetric half-period base delay).
  const delayA = ctx.createDelay(1);
  delayA.delayTime.value = initDelays.delayA;
  const tapA = ctx.createGain();
  const modeA = ctx.createGain();
  const panA = createPanner(ctx);
  const analyserA = ctx.createAnalyser();
  analyserA.fftSize = 2048;
  analyserA.smoothingTimeConstant = 0;

  // Path B: polarity-inverted (+ continuous fine offset around half-period).
  const polarity = ctx.createGain();
  polarity.gain.value = -1; // ← the 180° phase inversion
  const delayB = ctx.createDelay(1);
  delayB.delayTime.value = initDelays.delayB;
  const tapB = ctx.createGain();
  const modeB = ctx.createGain();
  const panB = createPanner(ctx);
  const analyserB = ctx.createAnalyser();
  analyserB.fftSize = 2048;
  analyserB.smoothingTimeConstant = 0;

  osc.connect(delayA).connect(tapA);
  tapA.connect(analyserA);
  tapA.connect(modeA).connect(panA.input);
  panA.output.connect(out);

  osc.connect(polarity).connect(delayB).connect(tapB);
  tapB.connect(analyserB);
  tapB.connect(modeB).connect(panB.input);
  panB.output.connect(out);

  for (const g of [tapA, tapB, modeA, modeB]) g.gain.value = 0;

  const bufA = new Float32Array(analyserA.fftSize);
  const bufB = new Float32Array(analyserB.fftSize);

  function apply() {
    osc.type = p.waveform;
    const f = clamp(p.frequency, 20, nyquistSafe);
    const { delayA: dA, delayB: dB } = phaseDelays(f, p.offsetDeg);
    smooth(ctx, osc.frequency, f, 0.01);
    smooth(ctx, delayA.delayTime, dA, 0.01);
    smooth(ctx, delayB.delayTime, dB, 0.01);
    smooth(ctx, tapA.gain, clamp(p.levelA, 0, 1) * HEADROOM, 0.02);
    smooth(ctx, tapB.gain, clamp(p.levelB, 0, 1) * HEADROOM, 0.02);

    const aOn = p.mode !== 'inverted';
    const bOn = p.mode !== 'normal';
    smooth(ctx, modeA.gain, aOn ? 1 : 0, 0.01);
    smooth(ctx, modeB.gain, bOn ? 1 : 0, 0.01);
    panA.setPan(p.mode === 'dichotic' ? -1 : 0);
    panB.setPan(p.mode === 'dichotic' ? 1 : 0);
  }

  apply();
  osc.start();

  return {
    analyserA,
    analyserB,
    update(next) {
      p = { ...next };
      apply();
    },
    measurePhaseDeg() {
      analyserA.getFloatTimeDomainData(bufA);
      analyserB.getFloatTimeDomainData(bufB);
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < bufA.length; i++) {
        ab += bufA[i] * bufB[i];
        aa += bufA[i] * bufA[i];
        bb += bufB[i] * bufB[i];
      }
      if (aa < 1e-6 || bb < 1e-6) return null;
      const c = clamp(ab / Math.sqrt(aa * bb), -1, 1);
      return (Math.acos(c) * 180) / Math.PI;
    },
    stop(when) {
      safeStop(osc, when);
    },
    dispose() {
      disconnectAll([osc, delayA, tapA, modeA, analyserA, polarity, delayB, tapB, modeB, analyserB, ...panA.nodes, ...panB.nodes]);
    },
  };
}
