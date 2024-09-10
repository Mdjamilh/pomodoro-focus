import { describe, expect, it } from 'vitest'
import { announcement } from '../src/lib/announcer'
import type { TimerSnapshot } from '../src/timer/controller'

const MIN = 60_000

function snap(over: Partial<TimerSnapshot>): TimerSnapshot {
  return { phase: 'work', status: 'running', remainingMs: 25 * MIN, durationMs: 25 * MIN, cycle: 0, longBreakEvery: 4, ...over }
}

describe('screen reader announcements', () => {
  it('stays quiet between minute marks', () => {
    expect(announcement(snap({ remainingMs: 24 * MIN + 30_000 }), snap({ remainingMs: 24 * MIN + 29_000 }))).toBeNull()
    expect(announcement(snap({ remainingMs: 25 * MIN }), snap({ remainingMs: 25 * MIN - 1000 }))).toBeNull()
  })

  it('announces each whole minute', () => {
    expect(announcement(snap({ remainingMs: 24 * MIN + 1000 }), snap({ remainingMs: 24 * MIN }))).toBe('24 minutes left.')
    expect(announcement(snap({ remainingMs: MIN + 1000 }), snap({ remainingMs: MIN }))).toBe('1 minute left.')
  })

  it('announces a minute mark even if a tick was skipped', () => {
    expect(announcement(snap({ remainingMs: 20 * MIN + 5000 }), snap({ remainingMs: 19 * MIN + 40_000 }))).toBe('20 minutes left.')
  })

  it('announces start, pause and resume', () => {
    expect(announcement(snap({ status: 'idle' }), snap({}))).toBe('Focus started, 25 minutes.')
    expect(announcement(snap({ remainingMs: 90_000 }), snap({ status: 'paused', remainingMs: 90_000 }))).toBe(
      'Paused with 1 minute 30 seconds left.',
    )
    expect(announcement(snap({ status: 'paused', remainingMs: 90_000 }), snap({ remainingMs: 90_000 }))).toBe(
      'Resumed. 1 minute 30 seconds left.',
    )
  })

  it('announces a phase change and what comes next', () => {
    const next = snap({ phase: 'shortBreak', remainingMs: 5 * MIN, durationMs: 5 * MIN })
    expect(announcement(snap({ remainingMs: 1000 }), next)).toBe('Focus session complete. Short break started, 5 minutes.')
    expect(announcement(snap({ phase: 'shortBreak' }), snap({ status: 'idle' }))).toBe(
      'Short break over. Next: Focus. Press Space to start.',
    )
  })

  it('says nothing on the first snapshot', () => {
    expect(announcement(null, snap({}))).toBeNull()
  })
})
