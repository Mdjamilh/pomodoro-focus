/// <reference lib="webworker" />
/**
 * Hand-written service worker. About 80 lines, no Workbox, so every caching
 * decision is visible here. See README "Offline" for the reasoning.
 */
import { SHELL, assetsFromHtml, cacheName, staleCaches, strategyFor } from './sw/precache'

declare const self: ServiceWorkerGlobalScope
/** Replaced at build time with a per-build id (see vite.config.ts). */
declare const __BUILD_ID__: string

const CACHE = cacheName(__BUILD_ID__)

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Fetch index.html fresh and cache whatever hashed files it references.
      const response = await fetch('/index.html', { cache: 'no-store' })
      const html = await response.clone().text()
      await cache.put('/index.html', response)
      const urls = [...new Set([...SHELL.filter((u) => u !== '/index.html'), ...assetsFromHtml(html)])]
      await cache.addAll(urls)
      // Take over straight away. The app keeps all state in localStorage and
      // reads it fresh, so swapping workers mid-session is safe.
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(staleCaches(keys, CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put('/index.html', response.clone())
    return response
  } catch {
    // Offline: every route is the same single page, so serve the cached shell.
    return (await cache.match('/index.html')) ?? Response.error()
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const strategy = strategyFor(event.request.method, url, self.location.origin, event.request.mode)
  if (strategy === 'network-first') event.respondWith(networkFirst(event.request))
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event.request))
})

// Clicking a "session done" notification brings the app back to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows[0]
      if (existing) await existing.focus()
      else await self.clients.openWindow('/')
    })(),
  )
})
