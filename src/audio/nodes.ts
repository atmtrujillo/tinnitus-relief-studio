/**
 * Small DSP / graph helpers shared by the audio programs.
 */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Glide an AudioParam toward `value` with a first-order exponential approach
 * (settles in ~5 × tc). Unlike assigning `.value`, this avoids zipper noise
 * and clicks when a user drags a slider, and it's safe to call repeatedly.
 */
export function smooth(ctx: BaseAudioContext, param: AudioParam, value: number, tc = 0.015) {
  if (!Number.isFinite(value)) return;
  param.setTargetAtTime(value, ctx.currentTime, tc);
}

/** Freeze an AudioParam at its current value at time t, cancelling later automation. */
export function hold(param: AudioParam, t: number) {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(t);
  } else {
    // Firefox: no cancelAndHoldAtTime. Read the current value and pin it.
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
}

export function safeStop(src: AudioScheduledSourceNode, when = 0) {
  try {
    src.stop(when);
  } catch {
    /* already stopped / never started */
  }
}

export function disconnectAll(nodes: AudioNode[]) {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

/**
 * Convert a bandwidth in octaves to the (linear) Q of a band-pass filter:
 *   Q = √(2^N) / (2^N − 1)
 * e.g. 1 octave → Q ≈ 1.41, 1/3 octave → Q ≈ 4.32.
 */
export function qFromOctaves(octaves: number): number {
  const p = Math.pow(2, clamp(octaves, 0.02, 6));
  return Math.sqrt(p) / (p - 1);
}

/** Absolute bandwidth (Hz) of a band N octaves wide, geometrically centred on fc. */
export function bandwidthHz(center: number, octaves: number): number {
  return center * (Math.pow(2, octaves / 2) - Math.pow(2, -octaves / 2));
}

/**
 * Make-up gain for band-passed white noise. Filtering keeps only a fraction
 * of the noise power (≈ bandwidth / Nyquist), so a narrow band would be far
 * quieter than broadband noise at the same level setting. Scaling the
 * amplitude by 1/√fraction keeps the perceived level roughly constant as
 * the bandwidth changes. The 0.75 factor approximates the effective noise
 * bandwidth of two cascaded 2nd-order band-passes. The cap avoids absurd
 * gain at tiny bandwidths, and the master limiter catches anything left.
 */
export function narrowbandMakeup(sampleRate: number, center: number, octaves: number): number {
  const nyquist = sampleRate / 2;
  const bw = Math.min(nyquist, bandwidthHz(center, octaves) * 0.75);
  return clamp(1 / Math.sqrt(Math.max(bw / nyquist, 1e-4)), 1, 40);
}

/**
 * 4th-order Butterworth low/high-pass built from two cascaded biquads.
 *
 * NB: for Web Audio's lowpass/highpass BiquadFilterNode the Q parameter is
 * specified in dB, not as a linear Q. The Butterworth section Qs
 * (0.5412 and 1.3066) are therefore converted with 20·log10(Q).
 */
export function butterworth4(ctx: BaseAudioContext, type: 'lowpass' | 'highpass', freq: number) {
  const a = ctx.createBiquadFilter();
  const b = ctx.createBiquadFilter();
  a.type = type;
  b.type = type;
  a.Q.value = 20 * Math.log10(0.5412); // ≈ -5.33 dB
  b.Q.value = 20 * Math.log10(1.3066); // ≈ +2.32 dB
  const f = clamp(freq, 10, ctx.sampleRate / 2 - 100);
  a.frequency.value = f;
  b.frequency.value = f;
  a.connect(b);
  return {
    input: a as AudioNode,
    output: b as AudioNode,
    nodes: [a, b] as AudioNode[],
    setFrequency(hz: number) {
      const v = clamp(hz, 10, ctx.sampleRate / 2 - 100);
      smooth(ctx, a.frequency, v, 0.02);
      smooth(ctx, b.frequency, v, 0.02);
    },
  };
}

export interface Panner {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  setPan(v: number): void;
}

/**
 * Stereo balance control. Uses StereoPannerNode where available, and falls
 * back to an equal-power mono panner built from two gains and a channel
 * merger (older Safari).
 */
export function createPanner(ctx: BaseAudioContext): Panner {
  if (typeof (ctx as AudioContext).createStereoPanner === 'function') {
    const p = (ctx as AudioContext).createStereoPanner();
    return {
      input: p,
      output: p,
      nodes: [p],
      setPan: (v) => smooth(ctx, p.pan, clamp(v, -1, 1), 0.02),
    };
  }
  const input = ctx.createGain();
  input.channelCount = 1;
  input.channelCountMode = 'explicit';
  const l = ctx.createGain();
  const r = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  input.connect(l);
  input.connect(r);
  l.connect(merger, 0, 0);
  r.connect(merger, 0, 1);
  const setPan = (v: number) => {
    const angle = ((clamp(v, -1, 1) + 1) * Math.PI) / 4; // equal-power law
    smooth(ctx, l.gain, Math.cos(angle), 0.02);
    smooth(ctx, r.gain, Math.sin(angle), 0.02);
  };
  setPan(0);
  return { input, output: merger, nodes: [input, l, r, merger], setPan };
}

/**
 * A band-limited, smoothed square wave used as a click-free gate LFO for
 * pulsed tones. Odd harmonics 4/(πk) up to the 15th, with Lanczos σ-factors
 * to suppress Gibbs overshoot. The gate edges are therefore ~10 ms ramps,
 * rendered sample-accurately on the audio thread with no JS timers.
 */
export function smoothSquareWave(ctx: BaseAudioContext): PeriodicWave {
  const N = 15;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k += 2) {
    const x = (Math.PI * k) / (N + 1);
    imag[k] = (4 / (Math.PI * k)) * (Math.sin(x) / x);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}
