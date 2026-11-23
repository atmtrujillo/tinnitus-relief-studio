/**
 * Calibration program: a matching sound for tinnitus pitch-matching.
 *
 *   tone:        Oscillator ─► toneGain ─┐
 *   narrowband:  white noise ─► BP ─► BP ─► makeup ─┤
 *                                                   ▼
 *                     pulse gate (gain = 0.5 + 0.5·LFO) ─► level ─► panner ─► out
 *                         ▲
 *            smoothed-square LFO (2 Hz) ─► depth
 *
 * Both sound types run continuously. Switching type just cross-fades their
 * gains, which is click-free and instant. A pulsed (on/off) tone is often
 * easier to compare against continuous tinnitus. The gate is driven by an
 * audio-rate LFO summed into the gate's gain AudioParam (intrinsic value
 * 0.5 + LFO·0.5), so it's sample-accurate.
 *
 * Sweeps use exponentialRampToValueAtTime, a logarithmic glide that the
 * audio thread renders exactly. The UI reads the current frequency
 * analytically from AudioContext.currentTime.
 */

import type { Ear, WaveformType } from '../types';
import type { ProgramHandle } from './AudioEngine';
import {
  clamp,
  createPanner,
  disconnectAll,
  hold,
  narrowbandMakeup,
  qFromOctaves,
  safeStop,
  smooth,
  smoothSquareWave,
} from './nodes';
import { createNoiseSource, startNoise } from './noise';

export interface CalibrationParams {
  frequency: number;
  waveform: WaveformType;
  soundType: 'tone' | 'narrowband';
  bandwidthOct: number;
  level: number; // 0..1 relative level (master volume applied later)
  ear: Ear;
  pulsed: boolean;
}

export interface CalibrationHandle extends ProgramHandle {
  update(p: CalibrationParams): void;
  startSweep(from: number, to: number, seconds: number): void;
  /** Stops a sweep and holds the current frequency. Returns it. */
  stopSweep(): number;
  getCurrentFrequency(): number;
  isSweeping(): boolean;
}

/** Peak amplitude of a full-level tone (≈ -6 dBFS) leaves headroom for the mix. */
const TONE_HEADROOM = 0.5;
const PULSE_RATE_HZ = 2;

export function buildCalibration(ctx: AudioContext, out: AudioNode, initial: CalibrationParams): CalibrationHandle {
  let p = { ...initial };
  const nyquistSafe = ctx.sampleRate / 2 - 50;
  const f0 = clamp(p.frequency, 20, nyquistSafe);

  const osc = ctx.createOscillator();
  osc.type = p.waveform;
  osc.frequency.value = f0;
  const toneGain = ctx.createGain();
  toneGain.gain.value = 0;

  const noise = createNoiseSource(ctx, 'white');
  const bp1 = ctx.createBiquadFilter();
  const bp2 = ctx.createBiquadFilter();
  for (const bp of [bp1, bp2]) {
    bp.type = 'bandpass';
    bp.frequency.value = f0;
    bp.Q.value = qFromOctaves(p.bandwidthOct);
  }
  const nbGain = ctx.createGain();
  nbGain.gain.value = 0;

  const gate = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.setPeriodicWave(smoothSquareWave(ctx));
  lfo.frequency.value = PULSE_RATE_HZ;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0;

  const level = ctx.createGain();
  level.gain.value = 0;
  const panner = createPanner(ctx);

  osc.connect(toneGain).connect(gate);
  noise.connect(bp1);
  bp1.connect(bp2).connect(nbGain).connect(gate);
  lfo.connect(lfoDepth).connect(gate.gain);
  gate.connect(level).connect(panner.input);
  panner.output.connect(out);

  osc.start();
  startNoise(noise);
  lfo.start();

  let sweep: { from: number; to: number; t0: number; dur: number } | null = null;
  const freqParams = [osc.frequency, bp1.frequency, bp2.frequency];

  const progress = () => (sweep ? clamp((ctx.currentTime - sweep.t0) / sweep.dur, 0, 1) : 1);
  const currentFrequency = () =>
    sweep ? sweep.from * Math.pow(sweep.to / sweep.from, progress()) : p.frequency;

  function apply() {
    osc.type = p.waveform;
    const f = clamp(p.frequency, 20, nyquistSafe);
    if (!sweep) for (const param of freqParams) smooth(ctx, param, f, 0.01);

    const q = qFromOctaves(p.bandwidthOct);
    smooth(ctx, bp1.Q, q);
    smooth(ctx, bp2.Q, q);

    const isTone = p.soundType === 'tone';
    smooth(ctx, toneGain.gain, isTone ? TONE_HEADROOM : 0, 0.02);
    smooth(ctx, nbGain.gain, isTone ? 0 : narrowbandMakeup(ctx.sampleRate, f, p.bandwidthOct), 0.02);

    // Gate: steady → gain 1, depth 0. Pulsed → gain 0.5 ± 0.5·LFO.
    smooth(ctx, gate.gain, p.pulsed ? 0.5 : 1, 0.01);
    smooth(ctx, lfoDepth.gain, p.pulsed ? 0.5 : 0, 0.01);

    smooth(ctx, level.gain, clamp(p.level, 0, 1), 0.02);
    panner.setPan(p.ear === 'left' ? -1 : p.ear === 'right' ? 1 : 0);
  }

  apply();

  return {
    update(next) {
      p = { ...next };
      apply();
    },
    startSweep(from, to, seconds) {
      const a = clamp(from, 20, nyquistSafe);
      const b = clamp(to, 20, nyquistSafe);
      const dur = clamp(seconds, 1, 600);
      const t = ctx.currentTime + 0.01;
      for (const param of freqParams) {
        hold(param, ctx.currentTime);
        param.setValueAtTime(a, t);
        param.exponentialRampToValueAtTime(b, t + dur);
      }
      sweep = { from: a, to: b, t0: t, dur };
    },
    stopSweep() {
      const f = currentFrequency();
      const t = ctx.currentTime;
      for (const param of freqParams) {
        hold(param, t);
        param.setValueAtTime(f, t);
      }
      sweep = null;
      p.frequency = f;
      return f;
    },
    getCurrentFrequency: currentFrequency,
    isSweeping: () => !!sweep && progress() < 1,
    stop(when) {
      safeStop(osc, when);
      safeStop(noise, when);
      safeStop(lfo, when);
    },
    dispose() {
      disconnectAll([osc, toneGain, noise, bp1, bp2, nbGain, lfo, lfoDepth, gate, level, ...panner.nodes]);
    },
  };
}
