import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  advance,
  elapsedMs,
  initialState,
  nextPhase,
  pause,
  remainingMs,
  reset,
  skip,
  start,
  toggle,
  type TimerConfig,
} from '../src/timer/engine'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 20, 9, 0, 0)
const manual: TimerConfig = { ...DEFAULT_CONFIG, autoStartBreaks: false, autoStartWork: false }

describe('timing from timestamps', () => {
  it('starts with the full work duration remaining', () => {
    const s = initialState()
    expect(remainingMs(s, DEFAULT_CONFIG, T0)).toBe(25 * MIN)
  })

  it('derives remaining time from the start timestamp, not from ticks', () => {
    const s = start(initialState(), T0)
    expect(remainingMs(s, DEFAULT_CONFIG, T0 + 90_000)).toBe(25 * MIN - 90_000)
  })

  it('freezes elapsed time while paused and resumes from the same point', () => {
    let s = start(initialState(), T0)
    s = pause(s, T0 + 5 * MIN)
    expect(elapsedMs(s, T0 + 50 * MIN)).toBe(5 * MIN)
    s = start(s, T0 + 60 * MIN)
    expect(remainingMs(s, DEFAULT_CONFIG, T0 + 61 * MIN)).toBe(19 * MIN)
  })

  it('keeps the original phase start when resuming', () => {
    let s = start(initialState(), T0)
    s = pause(s, T0 + MIN)
    s = start(s, T0 + 2 * MIN)
    expect(s.phaseStartedAt).toBe(T0)
  })

  it('ignores a clock that jumps backwards', () => {
    const s = start(initialState(), T0)
    expect(elapsedMs(s, T0 - 10_000)).toBe(0)
  })

  it('never reports negative remaining time', () => {
    const s = start(initialState(), T0)
    expect(remainingMs(s, DEFAULT_CONFIG, T0 + 99 * MIN)).toBe(0)
  })

  it('toggle switches between running and paused', () => {
    let s = toggle(initialState(), T0)
    expect(s.status).toBe('running')
    s = toggle(s, T0 + 1000)
    expect(s.status).toBe('paused')
    expect(s.elapsed).toBe(1000)
  })

  it('start and pause are idempotent', () => {
    const running = start(initialState(), T0)
    expect(start(running, T0 + 5000)).toBe(running)
    const idle = initialState()
    expect(pause(idle, T0)).toBe(idle)
  })

  it('reset rewinds the phase but keeps the cycle count', () => {
    const s = reset({ ...start(initialState(), T0), cycle: 2, elapsed: 4000 })
    expect(s).toMatchObject({ status: 'idle', elapsed: 0, startedAt: null, cycle: 2, phase: 'work' })
  })
})

describe('phase order', () => {
  it('alternates work and short breaks, with a long break every N sessions', () => {
    expect(nextPhase('work', 1, DEFAULT_CONFIG)).toBe('shortBreak')
    expect(nextPhase('work', 3, DEFAULT_CONFIG)).toBe('shortBreak')
    expect(nextPhase('work', 4, DEFAULT_CONFIG)).toBe('longBreak')
    expect(nextPhase('shortBreak', 1, DEFAULT_CONFIG)).toBe('work')
    expect(nextPhase('longBreak', 0, DEFAULT_CONFIG)).toBe('work')
  })

  it('respects a custom long-break interval', () => {
    const cfg = { ...DEFAULT_CONFIG, longBreakEvery: 2 }
    expect(nextPhase('work', 2, cfg)).toBe('longBreak')
  })

  it('skipping work moves to a break without counting the session', () => {
    const s = skip({ ...start(initialState(), T0), cycle: 1 }, DEFAULT_CONFIG)
    expect(s).toMatchObject({ phase: 'shortBreak', status: 'idle', cycle: 1, elapsed: 0 })
  })

  it('skipping a long break resets the cycle', () => {
    const s = skip({ ...initialState(), phase: 'longBreak', cycle: 4 }, DEFAULT_CONFIG)
    expect(s).toMatchObject({ phase: 'work', cycle: 0 })
  })
})

describe('advance', () => {
  it('does nothing before the phase ends', () => {
    const s = start(initialState(), T0)
    const r = advance(s, DEFAULT_CONFIG, T0 + 25 * MIN - 1)
    expect(r.completed).toEqual([])
    expect(r.state).toBe(s)
  })

  it('does nothing while idle or paused', () => {
    const paused = pause(start(initialState(), T0), T0 + MIN)
    expect(advance(paused, DEFAULT_CONFIG, T0 + 99 * MIN).completed).toEqual([])
  })

  it('completes work at its exact end time and waits when auto-start is off', () => {
    const s = start(initialState(), T0)
    const r = advance(s, manual, T0 + 40 * MIN)
    expect(r.completed).toEqual([{ phase: 'work', startedAt: T0, endedAt: T0 + 25 * MIN, durationMs: 25 * MIN }])
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'idle', cycle: 1 })
  })

  it('accounts for time spent paused when computing the end', () => {
    let s = start(initialState(), T0)
    s = pause(s, T0 + 10 * MIN)
    s = start(s, T0 + 30 * MIN)
    const r = advance(s, manual, T0 + 60 * MIN)
    expect(r.completed[0].endedAt).toBe(T0 + 45 * MIN)
    expect(r.completed[0].startedAt).toBe(T0)
  })

  it('auto-starts the break from the exact end of the work session', () => {
    const s = start(initialState(), T0)
    const r = advance(s, DEFAULT_CONFIG, T0 + 27 * MIN)
    expect(r.state).toMatchObject({ phase: 'shortBreak', status: 'running', startedAt: T0 + 25 * MIN })
    expect(remainingMs(r.state, DEFAULT_CONFIG, T0 + 27 * MIN)).toBe(3 * MIN)
  })

  it('replays several phases after a long sleep', () => {
    const cfg = { ...DEFAULT_CONFIG, autoStartWork: true }
    const s = start(initialState(), T0)
    // 25 work + 5 break + 25 work + 5 break = 60 minutes, then 2 minutes into work #3.
    const r = advance(s, cfg, T0 + 62 * MIN)
    expect(r.completed.map((c) => c.phase)).toEqual(['work', 'shortBreak', 'work', 'shortBreak'])
    expect(r.completed.map((c) => c.endedAt - T0)).toEqual([25, 30, 55, 60].map((m) => m * MIN))
    expect(r.state).toMatchObject({ phase: 'work', cycle: 2 })
    expect(remainingMs(r.state, cfg, T0 + 62 * MIN)).toBe(23 * MIN)
  })

  it('takes a long break after the configured number of sessions and then resets the cycle', () => {
    const cfg = { ...DEFAULT_CONFIG, autoStartWork: true, longBreakEvery: 2 }
    const s = start(initialState(), T0)
    const r = advance(s, cfg, T0 + (25 + 5 + 25 + 15) * MIN)
    expect(r.completed.map((c) => c.phase)).toEqual(['work', 'shortBreak', 'work', 'longBreak'])
    expect(r.state).toMatchObject({ phase: 'work', cycle: 0 })
  })

  it('stops replaying at a phase that does not auto-start', () => {
    const s = start(initialState(), T0)
    const r = advance(s, DEFAULT_CONFIG, T0 + 10 * 60 * MIN)
    // Break auto-starts, work does not, so we stop after one work + one break.
    expect(r.completed.map((c) => c.phase)).toEqual(['work', 'shortBreak'])
    expect(r.state).toMatchObject({ phase: 'work', status: 'idle' })
  })
})
