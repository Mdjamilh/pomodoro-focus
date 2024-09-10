import type { TimerSnapshot } from '../timer/controller'
import { PHASE_LABEL, formatSpoken } from './format'

/**
 * Decides what, if anything, a screen reader should hear for a state change.
 *
 * Announcing every second would make the page unusable with a screen reader,
 * so we only speak when the user did something (start, pause, reset, skip),
 * when a phase changes, and when the remaining time crosses a whole minute.
 */
export function announcement(prev: TimerSnapshot | null, next: TimerSnapshot): string | null {
  const label = PHASE_LABEL[next.phase]
  if (!prev) return null

  if (prev.phase !== next.phase) {
    const done = prev.phase === 'work' ? 'Focus session complete.' : `${PHASE_LABEL[prev.phase]} over.`
    const what = next.status === 'running' ? `${label} started, ${formatSpoken(next.remainingMs)}.` : `Next: ${label}. Press Space to start.`
    return `${done} ${what}`
  }

  if (prev.status !== next.status) {
    if (next.status === 'running') {
      return prev.status === 'paused'
        ? `Resumed. ${formatSpoken(next.remainingMs)} left.`
        : `${label} started, ${formatSpoken(next.remainingMs)}.`
    }
    if (next.status === 'paused') return `Paused with ${formatSpoken(next.remainingMs)} left.`
    return `${label} reset to ${formatSpoken(next.remainingMs)}.`
  }

  if (next.status === 'running') {
    const before = Math.ceil(prev.remainingMs / 60_000)
    const after = Math.ceil(next.remainingMs / 60_000)
    // Minute marks: 24:00, 23:00, ... are crossed when the rounded-up minute drops.
    if (after < before && after > 0) {
      return `${after} ${after === 1 ? 'minute' : 'minutes'} left.`
    }
  }
  return null
}

/**
 * Writes to a polite live region. Clearing first and setting the text on the
 * next frame makes repeated identical messages get read again.
 */
export function announce(region: HTMLElement, message: string): void {
  region.textContent = ''
  requestAnimationFrame(() => {
    region.textContent = message
  })
}
