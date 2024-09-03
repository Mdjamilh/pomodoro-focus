import { DEFAULT_CONFIG, type TimerConfig } from '../timer/engine'
import { isRecord, readJSON, writeJSON, type KeyValueStore } from './storage'

export type Theme = 'system' | 'light' | 'dark'

export interface Settings extends TimerConfig {
  sound: boolean
  volume: number
  notifications: boolean
  theme: Theme
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_CONFIG,
  sound: true,
  volume: 0.5,
  notifications: false,
  theme: 'system',
}

export const LIMITS = {
  workMinutes: [1, 120],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 90],
  longBreakEvery: [2, 12],
} as const

const KEY = 'settings'

function clampInt(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Accepts anything and returns a complete, in-range Settings object. */
export function normalizeSettings(input: unknown): Settings {
  const v = isRecord(input) ? input : {}
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  const d = DEFAULT_SETTINGS
  const volume = typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : d.volume
  return {
    workMinutes: clampInt(v.workMinutes, LIMITS.workMinutes, d.workMinutes),
    shortBreakMinutes: clampInt(v.shortBreakMinutes, LIMITS.shortBreakMinutes, d.shortBreakMinutes),
    longBreakMinutes: clampInt(v.longBreakMinutes, LIMITS.longBreakMinutes, d.longBreakMinutes),
    longBreakEvery: clampInt(v.longBreakEvery, LIMITS.longBreakEvery, d.longBreakEvery),
    autoStartBreaks: bool(v.autoStartBreaks, d.autoStartBreaks),
    autoStartWork: bool(v.autoStartWork, d.autoStartWork),
    sound: bool(v.sound, d.sound),
    volume,
    notifications: bool(v.notifications, d.notifications),
    theme: v.theme === 'light' || v.theme === 'dark' || v.theme === 'system' ? v.theme : d.theme,
  }
}

export function loadSettings(store: KeyValueStore): Settings {
  return readJSON(store, KEY, DEFAULT_SETTINGS, normalizeSettings)
}

export function saveSettings(store: KeyValueStore, settings: Settings): Settings {
  const clean = normalizeSettings(settings)
  writeJSON(store, KEY, clean)
  return clean
}
