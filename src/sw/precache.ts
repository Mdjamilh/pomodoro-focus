/**
 * Pure helpers for the service worker, kept free of worker globals so they
 * can be unit-tested in a normal DOM environment.
 */

export const CACHE_PREFIX = 'pomodoro-focus-'

/** Files that exist in every build and are needed to start offline. */
export const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

/**
 * Finds the hashed JS and CSS files referenced by the built index.html.
 *
 * Vite gives them content-hashed names (assets/index-a1b2c3.js) that change
 * every build, so instead of hard-coding them, or pulling in a build plugin to
 * generate a manifest, the worker downloads index.html at install time and
 * reads the URLs out of it.
 */
export function assetsFromHtml(html: string): string[] {
  const found = new Set<string>()
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi
  for (const match of html.matchAll(re)) {
    const url = match[1]
    // Only same-origin, root-relative URLs. Skip protocol-relative and external ones.
    if (url.startsWith('/') && !url.startsWith('//')) found.add(url.split('#')[0])
  }
  return [...found]
}

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`
}

/** Caches from older builds, which `activate` deletes. */
export function staleCaches(keys: readonly string[], current: string): string[] {
  return keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== current)
}

export type Strategy = 'network-first' | 'cache-first' | 'bypass'

/**
 * Which strategy to use for a request:
 * - Page navigations: network first, so a new deploy shows up as soon as you
 *   are online, falling back to the cached index.html offline.
 * - Hashed build assets and icons: cache first. Their names change whenever
 *   their contents do, so a cached copy can never be stale.
 * - Anything else (other origins, non-GET): left to the browser.
 */
export function strategyFor(method: string, url: URL, origin: string, mode: string): Strategy {
  if (method !== 'GET' || url.origin !== origin) return 'bypass'
  if (mode === 'navigate') return 'network-first'
  if (url.pathname === '/sw.js') return 'bypass'
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    return 'cache-first'
  }
  return 'bypass'
}
