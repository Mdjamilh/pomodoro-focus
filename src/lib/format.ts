import type { Phase, Status } from '../timer/engine'

/** Whole seconds left, rounded up so the display shows 25:00 until a full second has passed. */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000))
}

export function formatClock(ms: number): string {
  const total = secondsLeft(ms)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "12 minutes 30 seconds", for screen readers. */
export function formatSpoken(ms: number): string {
  const total = secondsLeft(ms)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return plural(s, 'second')
  if (s === 0) return plural(m, 'minute')
  return `${plural(m, 'minute')} ${plural(s, 'second')}`
}

/** "1 h 40 min" style totals for the history panel. */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

export const PHASE_LABEL: Record<Phase, string> = {
  work: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

export function documentTitle(ms: number, phase: Phase, status: Status): string {
  const base = 'Pomodoro Focus'
  if (status === 'idle') return base
  if (status === 'paused') return `Paused ${formatClock(ms)} | ${base}`
  return `${formatClock(ms)} ${PHASE_LABEL[phase]} | ${base}`
}
