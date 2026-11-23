import { describe, it, expect } from 'vitest';
import { getNoiseBuffer } from './noise';
import type { NoiseColor } from '../types';

function makeMockContext(sampleRate = 8000): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, sr: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: sr,
        duration: length / sr,
        getChannelData(ch: number) {
          return data[ch];
        },
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

describe('Noise synthesis (noise.ts)', () => {
  it.each<NoiseColor>(['white', 'pink', 'brown'])(
    'generates DC-free, RMS-normalised, bounded stereo %s noise and caches per context',
    (color) => {
      const ctx = makeMockContext(8000);
      const buf = getNoiseBuffer(ctx, color);
      expect(buf.numberOfChannels).toBe(2);
      expect(buf.length).toBe(8000 * 8);

      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);

      for (const ch of [left, right]) {
        let sum = 0;
        let sq = 0;
        let maxAbs = 0;
        for (let i = 0; i < ch.length; i++) {
          const v = ch[i];
          sum += v;
          sq += v * v;
          if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
        }
        const mean = sum / ch.length;
        const rms = Math.sqrt(sq / ch.length);
        expect(Math.abs(mean)).toBeLessThan(0.01);
        expect(rms).toBeCloseTo(0.25, 1);
        expect(maxAbs).toBeLessThanOrEqual(1);
      }

      // Stereo channels should be decorrelated (not identical)
      let sameCount = 0;
      for (let i = 0; i < 200; i++) {
        if (left[i] === right[i]) sameCount++;
      }
      expect(sameCount).toBeLessThan(5);

      // Subsequent call returns cached buffer
      expect(getNoiseBuffer(ctx, color)).toBe(buf);
    }
  );
});
