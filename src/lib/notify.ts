import type { Phase } from '../timer/engine'
import { PHASE_LABEL } from './format'

export type NotifyPermission = NotificationPermission | 'unsupported'

export function notificationPermission(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Must be called from a user gesture (the settings toggle). */
export async function requestNotifications(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function completionMessage(finished: Phase, next: Phase, nextRunning: boolean): { title: string; body: string } {
  const title = finished === 'work' ? 'Focus session done' : `${PHASE_LABEL[finished]} over`
  const body = nextRunning ? `${PHASE_LABEL[next]} has started.` : `Ready for ${PHASE_LABEL[next].toLowerCase()} when you are.`
  return { title, body }
}

/**
 * Shows a desktop notification if allowed. Prefers the service worker
 * registration, which is the only way that works on Android Chrome, and falls
 * back to the page-level constructor.
 */
export async function showNotification(title: string, body: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  const options: NotificationOptions = { body, icon: '/icons/icon-192.png', tag: 'pomodoro-phase' }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
