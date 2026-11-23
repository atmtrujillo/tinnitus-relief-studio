import { describe, it, expect } from 'vitest';
import { appReducer, INITIAL_STATE } from './AppContext';
import { DEFAULT_SETTINGS, type SessionRecord, type TherapyPreset, type TinnitusProfile } from '../types';

const sampleProfile: TinnitusProfile = {
  frequency: 4200,
  soundType: 'tone',
  waveform: 'sine',
  bandwidthOct: 0.33,
  ear: 'both',
  savedAt: '2026-11-23T00:00:00.000Z',
};

const samplePreset: TherapyPreset = {
  id: 'preset-1',
  name: 'Evening Pink',
  layers: [
    {
      id: 'layer-1',
      kind: 'noise',
      enabled: true,
      color: 'pink',
      frequency: 4200,
      bandwidthOct: 0.5,
      waveform: 'sine',
      level: 0.5,
      pan: 0,
    },
  ],
  fadeIn: 1.5,
  fadeOut: 1.5,
  savedAt: '2026-11-23T00:00:00.000Z',
};

const sampleSession: SessionRecord = {
  id: 'sess-1',
  date: '2026-11-23T00:00:00.000Z',
  technique: 'Sound Therapy (pink noise)',
  source: 'therapy',
  frequency: null,
  duration: 600,
  ratingBefore: 7,
  ratingAfter: 4,
  notes: 'Felt calmer',
};

describe('appReducer (AppContext.tsx)', () => {
  it('sets and clears tinnitus profile', () => {
    const s1 = appReducer(INITIAL_STATE, { type: 'SET_TINNITUS_PROFILE', payload: sampleProfile });
    expect(s1.tinnitusProfile).toEqual(sampleProfile);
    const s2 = appReducer(s1, { type: 'SET_TINNITUS_PROFILE', payload: null });
    expect(s2.tinnitusProfile).toBeNull();
  });

  it('saves, updates in place by id, and deletes therapy presets', () => {
    const s1 = appReducer(INITIAL_STATE, { type: 'SAVE_PRESET', payload: samplePreset });
    expect(s1.presets).toHaveLength(1);

    const updated = { ...samplePreset, name: 'Evening Pink v2' };
    const s2 = appReducer(s1, { type: 'SAVE_PRESET', payload: updated });
    expect(s2.presets).toHaveLength(1);
    expect(s2.presets[0].name).toBe('Evening Pink v2');

    const s3 = appReducer(s2, { type: 'DELETE_PRESET', payload: 'preset-1' });
    expect(s3.presets).toHaveLength(0);
  });

  it('adds, deletes, and clears session records', () => {
    const s1 = appReducer(INITIAL_STATE, { type: 'ADD_SESSION', payload: sampleSession });
    const s2 = appReducer(s1, { type: 'ADD_SESSION', payload: { ...sampleSession, id: 'sess-2' } });
    expect(s2.sessions).toHaveLength(2);

    const s3 = appReducer(s2, { type: 'DELETE_SESSION', payload: 'sess-1' });
    expect(s3.sessions.map((s) => s.id)).toEqual(['sess-2']);

    const s4 = appReducer(s3, { type: 'CLEAR_SESSIONS' });
    expect(s4.sessions).toHaveLength(0);
  });

  it('merges partial settings updates and resets all state on RESET_ALL', () => {
    let s = appReducer(INITIAL_STATE, { type: 'SET_TINNITUS_PROFILE', payload: sampleProfile });
    s = appReducer(s, { type: 'SAVE_PRESET', payload: samplePreset });
    s = appReducer(s, { type: 'ADD_SESSION', payload: sampleSession });
    s = appReducer(s, {
      type: 'UPDATE_SETTINGS',
      payload: { maxVolume: 0.6, safetyAcknowledged: true, breakReminderMinutes: 20 },
    });

    expect(s.settings).toEqual({
      ...DEFAULT_SETTINGS,
      maxVolume: 0.6,
      safetyAcknowledged: true,
      breakReminderMinutes: 20,
    });

    const reset = appReducer(s, { type: 'RESET_ALL' });
    expect(reset).toEqual(INITIAL_STATE);
  });
});
