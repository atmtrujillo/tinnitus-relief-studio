import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatFrequency, formatDuration, volumeToPercent, storage } from './index';

describe('Utility helpers (utils/index.ts)', () => {
  it('formatFrequency formats Hz and kHz cleanly', () => {
    expect(formatFrequency(440)).toBe('440 Hz');
    expect(formatFrequency(999.6)).toBe('1000 Hz');
    expect(formatFrequency(1000)).toBe('1 kHz');
    expect(formatFrequency(4000)).toBe('4 kHz');
    expect(formatFrequency(4186)).toBe('4.2 kHz');
  });

  it('formatDuration formats seconds as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('volumeToPercent rounds 0..1 to 0..100', () => {
    expect(volumeToPercent(0)).toBe(0);
    expect(volumeToPercent(0.15)).toBe(15);
    expect(volumeToPercent(1)).toBe(100);
  });

  describe('storage wrapper', () => {
    const store = new Map<string, string>();

    beforeEach(() => {
      store.clear();
      (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: vi.fn((k: string) => store.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store.set(k, v);
        }),
        removeItem: vi.fn((k: string) => {
          store.delete(k);
        }),
        clear: vi.fn(() => store.clear()),
        key: vi.fn(() => null),
        length: 0,
      };
    });

    it('reads, writes, and removes namespaced JSON keys', () => {
      expect(storage.get('profile', null)).toBeNull();
      storage.set('profile', { frequency: 4000 });
      expect(store.get('trs-profile')).toBe('{"frequency":4000}');
      expect(storage.get('profile', null)).toEqual({ frequency: 4000 });
      storage.remove('profile');
      expect(storage.get('profile', null)).toBeNull();
    });

    it('never throws when localStorage access throws (e.g. restricted storage)', () => {
      (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
        removeItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      };

      expect(storage.get('k', 'fallback')).toBe('fallback');
      expect(() => storage.set('k', { a: 1 })).not.toThrow();
      expect(() => storage.remove('k')).not.toThrow();
    });
  });
});
