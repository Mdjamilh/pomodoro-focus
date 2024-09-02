/**
 * Small JSON wrapper around localStorage.
 *
 * localStorage can throw (Safari private mode, quota exceeded, storage
 * disabled by policy), and anything read back may have been edited by hand or
 * written by an older version. Reads therefore always go through a validator
 * and fall back to a default instead of crashing the app.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'pomodoro-focus:'

/** In-memory fallback used when localStorage is unavailable. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

export function defaultStore(): KeyValueStore {
  try {
    const probe = `${PREFIX}probe`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return memoryStore()
  }
}

export function readJSON<T>(store: KeyValueStore, key: string, fallback: T, validate: (v: unknown) => T | null): T {
  try {
    const raw = store.getItem(PREFIX + key)
    if (raw === null) return fallback
    return validate(JSON.parse(raw)) ?? fallback
  } catch {
    return fallback
  }
}

export function writeJSON(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(store: KeyValueStore, key: string): void {
  try {
    store.removeItem(PREFIX + key)
  } catch {
    // Nothing useful to do if storage refuses a delete.
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
