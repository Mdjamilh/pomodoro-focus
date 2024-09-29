/**
 * Registers the service worker in production builds. In development Vite
 * serves source files that the worker would cache and then serve stale, so
 * it is skipped there.
 */
export function registerServiceWorker(statusEl: HTMLElement | null): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (statusEl) statusEl.textContent = 'Available offline.'
      })
      .catch(() => {
        // Not fatal: the app works online without a worker (e.g. private windows in some browsers).
      })
  })

  const showConnection = () => {
    if (statusEl && !navigator.onLine) statusEl.textContent = 'You are offline. The timer keeps working.'
    else if (statusEl && navigator.serviceWorker.controller) statusEl.textContent = 'Available offline.'
  }
  window.addEventListener('online', showConnection)
  window.addEventListener('offline', showConnection)
}
