import { describe, expect, it } from 'vitest'
import { documentTitle, formatClock, formatMinutes, formatSpoken } from '../src/lib/format'

describe('format', () => {
  it('rounds the clock up so a fresh timer shows its full length', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(25 * 60_000 - 1)).toBe('25:00')
    expect(formatClock(25 * 60_000 - 1000)).toBe('24:59')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-50)).toBe('00:00')
  })

  it('handles sessions longer than an hour', () => {
    expect(formatClock(90 * 60_000)).toBe('90:00')
  })

  it('spells out time for screen readers', () => {
    expect(formatSpoken(60_000)).toBe('1 minute')
    expect(formatSpoken(150_000)).toBe('2 minutes 30 seconds')
    expect(formatSpoken(1_000)).toBe('1 second')
  })

  it('formats history totals', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(100)).toBe('1 h 40 min')
  })

  it('puts the remaining time in the title once the timer has started', () => {
    expect(documentTitle(61_000, 'work', 'running')).toBe('01:01 Focus | Pomodoro Focus')
    expect(documentTitle(61_000, 'shortBreak', 'paused')).toBe('Paused 01:01 | Pomodoro Focus')
    expect(documentTitle(61_000, 'work', 'idle')).toBe('Pomodoro Focus')
  })
})
