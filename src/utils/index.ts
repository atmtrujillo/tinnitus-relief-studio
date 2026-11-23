/**
 * Utility functions for the application.
 */

/**
 * Generate a unique ID for records.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format frequency for display.
 */
export function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

/**
 * Format duration in seconds to mm:ss.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a date string for display.
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert linear volume (0-1) to a display percentage.
 */
export function volumeToPercent(volume: number): number {
  return Math.round(volume * 100);
}

/**
 * Local storage helper with JSON serialisation.
 */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(`trs-${key}`);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`trs-${key}`, JSON.stringify(value));
    } catch {
      // Storage might be full or unavailable
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(`trs-${key}`);
    } catch {
      // Storage might be unavailable
    }
  },
};

/**
 * Musical note frequencies (A4 = 440 Hz, equal temperament).
 */
export const MUSICAL_NOTES = [
  { name: 'C2', freq: 65 },
  { name: 'C3', freq: 131 },
  { name: 'A3', freq: 220 },
  { name: 'C4', freq: 262 },
  { name: 'E4', freq: 330 },
  { name: 'A4', freq: 440 },
  { name: 'C5', freq: 523 },
  { name: 'E5', freq: 659 },
  { name: 'A5', freq: 880 },
  { name: 'C6', freq: 1047 },
  { name: 'E6', freq: 1319 },
  { name: 'A6', freq: 1760 },
  { name: 'C7', freq: 2093 },
  { name: 'E7', freq: 2637 },
  { name: 'A7', freq: 3520 },
  { name: 'C8', freq: 4186 },
  { name: 'E8', freq: 5274 },
  { name: 'A8', freq: 7040 },
  { name: 'C9', freq: 8372 },
  { name: 'E9', freq: 10548 },
  { name: 'B9', freq: 15804 },
];
