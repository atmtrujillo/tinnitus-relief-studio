/**
 * Sound-therapy program: a live-editable mix of layers.
 *
 *   noise       coloured noise (white / pink / brown)
 *   narrowband  white noise ─► band-pass ─► band-pass ─► make-up gain
 *               (a band centred on the tinnitus pitch, N octaves wide)
 *   notched     coloured noise with a band REMOVED around the tinnitus
 *               pitch: 4th-order Butterworth low-pass below the notch summed
 *               with a 4th-order high-pass above it. This resembles the
 *               "notched sound" approaches explored in tinnitus research
 *               (evidence is mixed; treat it as experimental).
 *   tone        oscillator
 *
 * Every layer ends in   level gain ─► stereo balance ─► program bus.
 *
 * update() diffs the new layer list against the running voices. Parameter
 * changes glide in place. Structural changes (kind/colour, add, remove)
 * cross-fade a rebuilt voice in and the old one out over ~60 ms, so editing
 * while listening never clicks.
 */

import type { LayerKind, NoiseColor, TherapyLayer } from '../types';
import type { ProgramHandle } from './AudioEngine';
import {
  butterworth4,
  clamp,
  createPanner,
  disconnectAll,
  narrowbandMakeup,
  qFromOctaves,
  safeStop,
  smooth,
  type Panner,
} from './nodes';
import { createNoiseSource, startNoise } from './noise';

export interface TherapyParams {
  layers: TherapyLayer[];
}

export interface TherapyHandle extends ProgramHandle {
  update(p: TherapyParams): void;
}

const TONE_HEADROOM = 0.5;

interface Voice {
  kind: LayerKind;
  color: NoiseColor;
  out: GainNode;
  pan: Panner;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  set(l: TherapyLayer): void;
}

function buildVoice(ctx: AudioContext, dest: AudioNode, layer: TherapyLayer): Voice {
  const nyq = ctx.sampleRate / 2 - 100;
  const out = ctx.createGain();
  out.gain.value = 0; // fades in via set()
  const pan = createPanner(ctx);
  out.connect(pan.input);
  pan.output.connect(dest);

  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [out, ...pan.nodes];
  let setParams: (l: TherapyLayer) => void = () => {};

  switch (layer.kind) {
    case 'tone': {
      const osc = ctx.createOscillator();
      osc.type = layer.waveform;
      osc.frequency.value = clamp(layer.frequency, 20, nyq);
      const shape = ctx.createGain();
      shape.gain.value = TONE_HEADROOM;
      osc.connect(shape).connect(out);
      osc.start();
      sources.push(osc);
      nodes.push(osc, shape);
      setParams = (l) => {
        osc.type = l.waveform;
        smooth(ctx, osc.frequency, clamp(l.frequency, 20, nyq), 0.01);
      };
      break;
    }
    case 'noise': {
      const src = createNoiseSource(ctx, layer.color);
      src.connect(out);
      startNoise(src);
      sources.push(src);
      nodes.push(src);
      break;
    }
    case 'narrowband': {
      const src = createNoiseSource(ctx, 'white');
      const bp1 = ctx.createBiquadFilter();
      const bp2 = ctx.createBiquadFilter();
      const makeup = ctx.createGain();
      bp1.type = bp2.type = 'bandpass';
      src.connect(bp1);
      bp1.connect(bp2).connect(makeup).connect(out);
      startNoise(src);
      sources.push(src);
      nodes.push(src, bp1, bp2, makeup);
      setParams = (l) => {
        const f = clamp(l.frequency, 20, nyq);
        const q = qFromOctaves(l.bandwidthOct);
        for (const bp of [bp1, bp2]) {
          smooth(ctx, bp.frequency, f, 0.02);
          smooth(ctx, bp.Q, q, 0.02);
        }
        smooth(ctx, makeup.gain, narrowbandMakeup(ctx.sampleRate, f, l.bandwidthOct), 0.02);
      };
      // Initialise filters immediately (no glide from default 350 Hz).
      bp1.frequency.value = bp2.frequency.value = clamp(layer.frequency, 20, nyq);
      bp1.Q.value = bp2.Q.value = qFromOctaves(layer.bandwidthOct);
      makeup.gain.value = narrowbandMakeup(ctx.sampleRate, layer.frequency, layer.bandwidthOct);
      break;
    }
    case 'notched': {
      const src = createNoiseSource(ctx, layer.color);
      const edges = (l: TherapyLayer) => {
        const f = clamp(l.frequency, 20, nyq);
        const half = Math.pow(2, clamp(l.bandwidthOct, 0.1, 4) / 2);
        return { lo: f / half, hi: f * half };
      };
      const e = edges(layer);
      const lp = butterworth4(ctx, 'lowpass', e.lo);
      const hp = butterworth4(ctx, 'highpass', e.hi);
      src.connect(lp.input);
      src.connect(hp.input);
      lp.output.connect(out);
      hp.output.connect(out);
      startNoise(src);
      sources.push(src);
      nodes.push(src, ...lp.nodes, ...hp.nodes);
      setParams = (l) => {
        const { lo, hi } = edges(l);
        lp.setFrequency(lo);
        hp.setFrequency(hi);
      };
      break;
    }
  }

  const set = (l: TherapyLayer) => {
    setParams(l);
    smooth(ctx, out.gain, l.enabled ? clamp(l.level, 0, 1) : 0, 0.02);
    pan.setPan(l.pan);
  };
  set(layer);

  return { kind: layer.kind, color: layer.color, out, pan, sources, nodes, set };
}

const usesColor = (k: LayerKind) => k === 'noise' || k === 'notched';

export function buildTherapy(ctx: AudioContext, dest: AudioNode, initial: TherapyParams): TherapyHandle {
  const voices = new Map<string, Voice>();

  const retire = (v: Voice) => {
    const t = ctx.currentTime;
    smooth(ctx, v.out.gain, 0, 0.012);
    v.sources.forEach((s) => safeStop(s, t + 0.08));
    window.setTimeout(() => disconnectAll(v.nodes), 150);
  };

  const update = ({ layers }: TherapyParams) => {
    const seen = new Set<string>();
    for (const l of layers) {
      seen.add(l.id);
      const v = voices.get(l.id);
      const needsRebuild = !v || v.kind !== l.kind || (usesColor(l.kind) && v.color !== l.color);
      if (needsRebuild) {
        if (v) retire(v);
        voices.set(l.id, buildVoice(ctx, dest, l));
      } else {
        v!.set(l);
      }
    }
    for (const [id, v] of voices) {
      if (!seen.has(id)) {
        retire(v);
        voices.delete(id);
      }
    }
  };

  update(initial);

  return {
    update,
    stop(when) {
      voices.forEach((v) => v.sources.forEach((s) => safeStop(s, when)));
    },
    dispose() {
      voices.forEach((v) => disconnectAll(v.nodes));
      voices.clear();
    },
  };
}
