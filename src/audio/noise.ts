/**
 * Noise synthesis.
 *
 * Noise is rendered once per (AudioContext, colour) into an 8-second stereo
 * buffer (independent noise per channel, giving a wide, decorrelated image)
 * and then looped by AudioBufferSourceNodes. That costs no per-sample JS on
 * the audio thread, so latency stays low and nothing glitches when the main
 * thread is busy.
 *
 * - White: uniform random samples. Flat power spectral density.
 * - Pink: Paul Kellet's refined filter (sum of 1st-order low-passes),
 *   accurate to about ±0.05 dB over the audio band. −3 dB/octave, equal
 *   energy per octave.
 * - Brown: leaky integration of white noise. −6 dB/octave (1/f²).
 *
 * Each colour is normalised to the same RMS, so switching colours doesn't
 * jump in loudness. The loop seam is hidden with an equal-power crossfade.
 */

import type { NoiseColor } from '../types';

const BUFFER_SECONDS = 8;
const CROSSFADE = 4096;
const TARGET_RMS = 0.25; // ≈ -12 dBFS

const cache = new WeakMap<BaseAudioContext, Partial<Record<NoiseColor, AudioBuffer>>>();

function fillChannel(out: Float32Array, color: NoiseColor) {
  const len = out.length;
  const tmp = new Float32Array(len + CROSSFADE);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let brown = 0;

  for (let i = 0; i < tmp.length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') {
      tmp[i] = white;
    } else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      tmp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else {
      // Leaky integrator: y[n] = (y[n-1] + 0.02·x[n]) / 1.02.
      // The leak keeps the random walk bounded and removes very-low-frequency drift.
      brown = (brown + 0.02 * white) / 1.02;
      tmp[i] = brown;
    }
  }

  // Seamless loop. The extra CROSSFADE samples generated past the end are
  // blended into the head, so sample[len-1] → sample[0] continues the same
  // random process. Equal-power weights keep the level constant through the
  // blend.
  for (let i = 0; i < len; i++) out[i] = tmp[i];
  for (let i = 0; i < CROSSFADE; i++) {
    const w = i / CROSSFADE;
    out[i] = tmp[i] * Math.sqrt(w) + tmp[len + i] * Math.sqrt(1 - w);
  }

  // Remove DC and normalise to the target RMS.
  let mean = 0;
  for (let i = 0; i < len; i++) mean += out[i];
  mean /= len;
  let sq = 0;
  for (let i = 0; i < len; i++) {
    const v = out[i] - mean;
    sq += v * v;
  }
  const gain = TARGET_RMS / Math.sqrt(sq / len || 1);
  for (let i = 0; i < len; i++) {
    out[i] = Math.max(-1, Math.min(1, (out[i] - mean) * gain));
  }
}

export function getNoiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let entry = cache.get(ctx);
  if (!entry) {
    entry = {};
    cache.set(ctx, entry);
  }
  const hit = entry[color];
  if (hit) return hit;

  const length = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) fillChannel(buffer.getChannelData(ch), color);
  entry[color] = buffer;
  return buffer;
}

export function createNoiseSource(ctx: BaseAudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx, color);
  src.loop = true;
  return src;
}

/** Start at a random offset so layers using the same buffer stay uncorrelated. */
export function startNoise(src: AudioBufferSourceNode) {
  const dur = src.buffer?.duration ?? 0;
  src.start(0, Math.random() * dur);
}
