import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from '../src/lib/settings'
import { memoryStore, readJSON, writeJSON, type KeyValueStore } from '../src/lib/storage'

describe('settings', () => {
  it('fills in defaults for missing or garbage input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ workMinutes: 'abc', theme: 'neon' })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps durations to sane ranges and rounds them', () => {
    const s = normalizeSettings({ workMinutes: 0, shortBreakMinutes: 999, longBreakMinutes: '20', longBreakEvery: 3.6 })
    expect(s).toMatchObject({ workMinutes: 1, shortBreakMinutes: 60, longBreakMinutes: 20, longBreakEvery: 4 })
  })

  it('clamps the volume between 0 and 1', () => {
    expect(normalizeSettings({ volume: 4 }).volume).toBe(1)
    expect(normalizeSettings({ volume: -1 }).volume).toBe(0)
  })

  it('round-trips through storage', () => {
    const store = memoryStore()
    saveSettings(store, { ...DEFAULT_SETTINGS, workMinutes: 50, theme: 'dark' })
    expect(loadSettings(store)).toMatchObject({ workMinutes: 50, theme: 'dark' })
  })

  it('survives corrupt JSON in storage', () => {
    const store = memoryStore()
    store.setItem('pomodoro-focus:settings', '{not json')
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('storage helpers', () => {
  it('returns false instead of throwing when storage is full', () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(writeJSON(full, 'x', 1)).toBe(false)
  })

  it('uses the fallback when the validator rejects the value', () => {
    const store = memoryStore()
    writeJSON(store, 'n', 'text')
    expect(readJSON(store, 'n', 7, (v) => (typeof v === 'number' ? v : null))).toBe(7)
  })
})
