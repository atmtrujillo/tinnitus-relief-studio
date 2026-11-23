// Shared type definitions for Tinnitus Relief Studio.

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type NoiseColor = 'white' | 'pink' | 'brown';
export type Ear = 'both' | 'left' | 'right';
export type SourceKind = 'calibration' | 'phase' | 'therapy' | 'visualiser';

/** The user's subjective tinnitus match, saved from the calibration module. */
export interface TinnitusProfile {
  frequency: number; // Hz
  soundType: 'tone' | 'narrowband';
  waveform: WaveformType;
  bandwidthOct: number; // only meaningful for narrowband matches
  ear: Ear;
  notes?: string;
  savedAt: string; // ISO date
}

export type LayerKind = 'noise' | 'narrowband' | 'notched' | 'tone';

/** One layer of a sound-therapy mix. */
export interface TherapyLayer {
  id: string;
  kind: LayerKind;
  enabled: boolean;
  color: NoiseColor; // noise + notched layers
  frequency: number; // narrowband centre, notch centre or tone frequency (Hz)
  bandwidthOct: number; // narrowband bandwidth or notch width, in octaves
  waveform: WaveformType; // tone layers
  level: number; // 0..1 relative mix level (master volume is separate)
  pan: number; // -1 (left) .. +1 (right)
}

export interface TherapyPreset {
  id: string;
  name: string;
  layers: TherapyLayer[];
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  savedAt: string;
}

export interface SessionRecord {
  id: string;
  date: string; // ISO date (session end)
  technique: string;
  source: SourceKind | 'none';
  frequency: number | null;
  duration: number; // seconds of audio actually played during the session
  ratingBefore: number; // 0-10
  ratingAfter: number; // 0-10
  notes: string;
}

export interface AppSettings {
  maxVolume: number; // 0-1, software cap on the master volume slider
  defaultVolume: number; // 0-1, master volume applied when the app loads
  breakReminderMinutes: number; // 0 = off
  visualizerFps: number;
  safetyAcknowledged: boolean;
}

export interface AppState {
  tinnitusProfile: TinnitusProfile | null;
  presets: TherapyPreset[];
  sessions: SessionRecord[];
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxVolume: 0.8,
  defaultVolume: 0.15,
  breakReminderMinutes: 30,
  visualizerFps: 60,
  safetyAcknowledged: false,
};
