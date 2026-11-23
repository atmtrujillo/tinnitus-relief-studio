import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  AppState,
  TinnitusProfile,
  TherapyPreset,
  SessionRecord,
  AppSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { storage } from '../utils';
import { engine } from '../audio';

export const INITIAL_STATE: AppState = {
  tinnitusProfile: null,
  presets: [],
  sessions: [],
  settings: DEFAULT_SETTINGS,
};

export type Action =
  | { type: 'SET_TINNITUS_PROFILE'; payload: TinnitusProfile | null }
  | { type: 'SAVE_PRESET'; payload: TherapyPreset }
  | { type: 'DELETE_PRESET'; payload: string }
  | { type: 'ADD_SESSION'; payload: SessionRecord }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'CLEAR_SESSIONS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'RESET_ALL' };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_TINNITUS_PROFILE':
      return { ...state, tinnitusProfile: action.payload };
    case 'SAVE_PRESET':
      return {
        ...state,
        presets: [
          ...state.presets.filter((p) => p.id !== action.payload.id),
          action.payload,
        ],
      };
    case 'DELETE_PRESET':
      return {
        ...state,
        presets: state.presets.filter((p) => p.id !== action.payload),
      };
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.payload] };
    case 'DELETE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
      };
    case 'CLEAR_SESSIONS':
      return { ...state, sessions: [] };
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    case 'RESET_ALL':
      return INITIAL_STATE;
    default:
      return state;
  }
}

function loadInitialState(): AppState {
  const profile = storage.get<TinnitusProfile | null>('profile', null);
  const presets = storage.get<TherapyPreset[]>('presets', []);
  const sessions = storage.get<SessionRecord[]>('sessions', []);
  const savedSettings = storage.get<Partial<AppSettings> | null>('settings', null);

  return {
    tinnitusProfile: profile,
    presets: Array.isArray(presets) ? presets : [],
    sessions: Array.isArray(sessions) ? sessions : [],
    settings: { ...DEFAULT_SETTINGS, ...(savedSettings ?? {}) },
  };
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadInitialState);

  // Initialise engine master volume & cap once on mount from persisted settings.
  useEffect(() => {
    engine.setMaxVolume(state.settings.maxVolume);
    engine.setMasterVolume(Math.min(state.settings.defaultVolume, state.settings.maxVolume));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep engine max volume cap in sync with settings.
  useEffect(() => {
    engine.setMaxVolume(state.settings.maxVolume);
  }, [state.settings.maxVolume]);

  // Persist state changes to localStorage.
  useEffect(() => {
    if (state.tinnitusProfile) {
      storage.set('profile', state.tinnitusProfile);
    } else {
      storage.remove('profile');
    }
  }, [state.tinnitusProfile]);

  useEffect(() => {
    storage.set('presets', state.presets);
  }, [state.presets]);

  useEffect(() => {
    storage.set('sessions', state.sessions);
  }, [state.sessions]);

  useEffect(() => {
    storage.set('settings', state.settings);
  }, [state.settings]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
