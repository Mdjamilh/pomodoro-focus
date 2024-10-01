import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerController, type CompletionDetail, type TimerSnapshot } from '../src/timer/controller'
import { DEFAULT_CONFIG } from '../src/timer/engine'
import { memoryStore } from '../src/lib/storage'
import { formatClock } from '../src/lib/format'

const MIN = 60_000
const T0 = new Date('2026-10-20T09:00:00Z').getTime()

/** A fake document whose visibility we control. */
function fakeDoc() {
  const target = new EventTarget()
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    setHidden(hidden: boolean) {
      doc.visibilityState = hidden ? 'hidden' : 'visible'
      target.dispatchEvent(new Event('visibilitychange'))
    },
  }
  return doc
}

function setup(config = DEFAULT_CONFIG) {
  const doc = fakeDoc()
  const store = memoryStore()
  const timer = new TimerController(config, { store, doc })
  const completions: CompletionDetail[] = []
  const changes: TimerSnapshot[] = []
  timer.addEventListener('complete', (e) => completions.push((e as CustomEvent<CompletionDetail>).detail))
  timer.addEventListener('change', (e) => changes.push((e as CustomEvent<TimerSnapshot>).detail))
  return { timer, doc, store, completions, changes }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TimerController with fake timers', () => {
  it('ticks once per second while visible and the display follows', () => {
    const { timer, changes } = setup()
    timer.start()
    changes.length = 0
    vi.advanceTimersByTime(3000)
    expect(changes.map((c) => formatClock(c.remainingMs))).toEqual(['24:59', '24:58', '24:57'])
  })

  it('completes a work session after exactly 25 minutes', () => {
    const { timer, completions } = setup()
    timer.start()
    vi.advanceTimersByTime(25 * MIN - 1)
    expect(completions).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(completions).toHaveLength(1)
    expect(completions[0]).toMatchObject({ phase: 'work', startedAt: T0, endedAt: T0 + 25 * MIN, late: false })
    expect(timer.snapshot()).toMatchObject({ phase: 'shortBreak', status: 'running', remainingMs: 5 * MIN })
  })

  it('stays accurate when timer callbacks are throttled', () => {
    const { timer } = setup()
    timer.start()
    // Simulate a browser that only lets our timeout fire very late: move the
    // wall clock without running any timers, then let one callback through.
    vi.setSystemTime(T0 + 10 * MIN + 400)
    vi.advanceTimersToNextTimer()
    expect(formatClock(timer.snapshot().remainingMs)).toBe('14:59')
  })

  it('catches up after the tab sleeps through the end of a session', () => {
    const { timer, doc, completions } = setup()
    timer.start()
    doc.setHidden(true)
    // The machine sleeps: no timers fire at all while the clock jumps 27 minutes.
    vi.setSystemTime(T0 + 27 * MIN)
    expect(completions).toHaveLength(0)
    doc.setHidden(false)
    expect(completions).toHaveLength(1)
    expect(completions[0].endedAt).toBe(T0 + 25 * MIN)
    expect(completions[0].late).toBe(true)
    // The break started when the work session ended, not when we woke up.
    expect(timer.snapshot().remainingMs).toBe(3 * MIN)
  })

  it('schedules a single timeout for the phase end while hidden', () => {
    const { timer, doc, completions } = setup()
    timer.start()
    vi.advanceTimersByTime(MIN)
    doc.setHidden(true)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersToNextTimer()
    expect(Date.now()).toBe(T0 + 25 * MIN)
    expect(completions).toHaveLength(1)
  })

  it('does not count paused time', () => {
    const { timer, completions } = setup()
    timer.start()
    vi.advanceTimersByTime(10 * MIN)
    timer.pause()
    expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(T0 + 60 * MIN)
    timer.start()
    vi.advanceTimersByTime(15 * MIN)
    expect(completions).toHaveLength(1)
    expect(completions[0].endedAt).toBe(T0 + 75 * MIN)
  })

  it('restores a running timer from storage after a reload', () => {
    const first = setup()
    first.timer.start()
    vi.advanceTimersByTime(5 * MIN)
    first.timer.dispose()

    vi.setSystemTime(T0 + 8 * MIN)
    const reloaded = new TimerController(DEFAULT_CONFIG, { store: first.store })
    reloaded.sync()
    expect(reloaded.snapshot()).toMatchObject({ status: 'running', remainingMs: 17 * MIN })
  })

  it('ignores corrupt persisted state', () => {
    const store = memoryStore()
    store.setItem('pomodoro-focus:timer', JSON.stringify({ phase: 'nap', status: 'running' }))
    const timer = new TimerController(DEFAULT_CONFIG, { store })
    expect(timer.snapshot()).toMatchObject({ phase: 'work', status: 'idle' })
  })

  it('applies a shorter duration to the running phase immediately', () => {
    const { timer, completions } = setup()
    timer.start()
    vi.advanceTimersByTime(12 * MIN)
    timer.setConfig({ ...DEFAULT_CONFIG, workMinutes: 10 })
    expect(completions).toHaveLength(1)
    expect(completions[0].endedAt).toBe(T0 + 10 * MIN)
  })

  it('skip and reset stop the timer', () => {
    const { timer } = setup()
    timer.start()
    timer.skip()
    expect(timer.snapshot()).toMatchObject({ phase: 'shortBreak', status: 'idle' })
    timer.start()
    vi.advanceTimersByTime(MIN)
    timer.reset()
    expect(timer.snapshot()).toMatchObject({ phase: 'shortBreak', status: 'idle', remainingMs: 5 * MIN })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a second tab adopts the running timer from storage', () => {
    const tabA = setup()
    const tabB = new TimerController(DEFAULT_CONFIG, { store: tabA.store })
    tabA.timer.start()
    vi.advanceTimersByTime(2 * MIN)
    tabB.reload()
    expect(tabB.snapshot()).toMatchObject({ status: 'running', remainingMs: 23 * MIN })
    tabA.timer.pause()
    tabB.reload()
    expect(tabB.snapshot().status).toBe('paused')
    tabB.dispose()
  })
})
