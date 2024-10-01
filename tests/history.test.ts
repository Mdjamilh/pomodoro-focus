import { describe, expect, it } from 'vitest'
import {
  HistoryStore,
  MAX_RECORDS,
  addDays,
  byTask,
  dayKey,
  dayTotal,
  heatmap,
  lastSevenDays,
  levelFor,
  streaks,
  type SessionRecord,
} from '../src/lib/history'
import { memoryStore } from '../src/lib/storage'

// vitest.config.ts pins TZ to America/New_York.
const MIN = 60_000

let seq = 0
function session(localIso: string, minutes = 25, taskId: string | null = null, taskTitle: string | null = null): SessionRecord {
  const endedAt = new Date(localIso).getTime()
  return { id: String(seq++), taskId, taskTitle, startedAt: endedAt - minutes * MIN, endedAt, durationMs: minutes * MIN }
}

const NOW = new Date('2026-10-23T15:00:00').getTime() // a Friday

describe('day keys', () => {
  it('uses the local calendar date, not UTC', () => {
    // 23:30 in New York is already the next day in UTC.
    expect(dayKey(new Date('2026-10-22T23:30:00'))).toBe('2026-10-22')
  })

  it('steps over the DST change without skipping or repeating a day', () => {
    // US clocks fall back on 2026-11-01, so that day has 25 hours.
    const start = new Date(2026, 9, 31)
    const keys = [0, 1, 2].map((i) => dayKey(addDays(start, i)))
    expect(keys).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
    // Adding 24 hours of milliseconds lands on 1 November twice.
    const naive = [0, 1, 2].map((i) => dayKey(start.getTime() + i * 24 * 60 * MIN))
    expect(naive).toEqual(['2026-10-31', '2026-11-01', '2026-11-01'])
  })
})

describe('daily and weekly totals', () => {
  const records = [
    session('2026-10-23T09:25:00'),
    session('2026-10-23T10:00:00', 50),
    session('2026-10-21T09:00:00'),
    session('2026-10-10T09:00:00'),
  ]

  it('totals today', () => {
    expect(dayTotal(records, NOW)).toEqual({ date: '2026-10-23', count: 2, minutes: 75 })
  })

  it('returns seven days ending today, oldest first, including empty days', () => {
    const week = lastSevenDays(records, NOW)
    expect(week.map((d) => d.date)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ])
    expect(week.map((d) => d.count)).toEqual([0, 0, 0, 0, 1, 0, 2])
  })

  it('groups sessions by task and keeps deleted task titles', () => {
    const list = [
      session('2026-10-23T09:00:00', 25, 'a', 'Write'),
      session('2026-10-23T10:00:00', 25, 'a', 'Write'),
      session('2026-10-23T11:00:00', 25, null, null),
      session('2026-10-01T11:00:00', 25, 'b', 'Old'),
    ]
    expect(byTask(list, new Date('2026-10-17T00:00:00').getTime())).toEqual([
      { taskId: 'a', title: 'Write', count: 2, minutes: 50 },
      { taskId: null, title: 'No task', count: 1, minutes: 25 },
    ])
  })
})

describe('streaks', () => {
  it('is zero with no history', () => {
    expect(streaks([], NOW)).toEqual({ current: 0, longest: 0 })
  })

  it('counts consecutive days ending today', () => {
    const r = ['2026-10-21', '2026-10-22', '2026-10-23'].map((d) => session(`${d}T09:00:00`))
    expect(streaks(r, NOW)).toEqual({ current: 3, longest: 3 })
  })

  it('keeps the streak alive when today has nothing yet', () => {
    const r = ['2026-10-21', '2026-10-22'].map((d) => session(`${d}T09:00:00`))
    expect(streaks(r, NOW).current).toBe(2)
  })

  it('breaks after a missed day but remembers the longest run', () => {
    const r = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-20'].map((d) => session(`${d}T09:00:00`))
    expect(streaks(r, NOW)).toEqual({ current: 0, longest: 4 })
  })

  it('counts several sessions on one day once', () => {
    const r = [session('2026-10-23T09:00:00'), session('2026-10-23T11:00:00')]
    expect(streaks(r, NOW)).toEqual({ current: 1, longest: 1 })
  })

  it('runs across the DST change', () => {
    const r = ['2026-10-31', '2026-11-01', '2026-11-02'].map((d) => session(`${d}T12:00:00`))
    expect(streaks(r, new Date('2026-11-02T20:00:00').getTime())).toEqual({ current: 3, longest: 3 })
  })

  it('treats a late-night session as part of that local day', () => {
    const r = [session('2026-10-22T23:50:00'), session('2026-10-23T00:20:00')]
    expect(streaks(r, NOW).current).toBe(2)
  })
})

describe('heatmap', () => {
  it('maps counts to five levels', () => {
    expect([0, 1, 2, 3, 5, 8].map(levelFor)).toEqual([0, 1, 1, 2, 3, 4])
  })

  it('lays out whole weeks starting on Sunday with today in the last column', () => {
    const cells = heatmap([session('2026-10-23T09:00:00')], NOW, 4)
    expect(cells).toHaveLength(28)
    expect(cells[0].date).toBe('2026-09-27')
    expect(new Date(`${cells[0].date}T12:00:00`).getDay()).toBe(0)
    const today = cells.find((c) => c.date === '2026-10-23')!
    expect(today).toMatchObject({ week: 3, weekday: 5, count: 1, level: 1, future: false })
    expect(cells.at(-1)).toMatchObject({ date: '2026-10-24', future: true })
  })
})

describe('HistoryStore', () => {
  it('stores sessions and counts them per task', () => {
    const history = new HistoryStore(memoryStore())
    history.add({ taskId: 't', taskTitle: 'T', startedAt: 1, endedAt: 2, durationMs: 1 })
    history.add({ taskId: 't', taskTitle: 'T', startedAt: 3, endedAt: 4, durationMs: 1 })
    expect(history.countForTask('t')).toBe(2)
  })

  it('ignores a duplicate completion', () => {
    const history = new HistoryStore(memoryStore())
    const entry = { taskId: null, taskTitle: null, startedAt: 1, endedAt: 2, durationMs: 1 }
    history.add(entry)
    history.add(entry)
    expect(history.records).toHaveLength(1)
  })

  it('caps the number of stored records', () => {
    const store = memoryStore()
    const many = Array.from({ length: MAX_RECORDS }, (_, i) => ({ id: String(i), taskId: null, taskTitle: null, startedAt: i, endedAt: i + 1, durationMs: 1 }))
    store.setItem('pomodoro-focus:history', JSON.stringify(many))
    const history = new HistoryStore(store)
    history.add({ taskId: null, taskTitle: null, startedAt: 1e9, endedAt: 1e9 + 1, durationMs: 1 })
    expect(history.records).toHaveLength(MAX_RECORDS)
    expect(history.records[0].id).toBe('1')
  })

  it('reloads from storage', () => {
    const store = memoryStore()
    new HistoryStore(store).add({ taskId: null, taskTitle: null, startedAt: 1, endedAt: 2, durationMs: 1 })
    expect(new HistoryStore(store).records).toHaveLength(1)
  })
})

describe('two tabs sharing storage', () => {
  it('does not lose sessions written by the other tab', () => {
    const store = memoryStore()
    const tabA = new HistoryStore(store)
    const tabB = new HistoryStore(store)
    tabA.add({ taskId: null, taskTitle: null, startedAt: 1, endedAt: 2, durationMs: 1 })
    tabB.add({ taskId: null, taskTitle: null, startedAt: 3, endedAt: 4, durationMs: 1 })
    expect(new HistoryStore(store).records.map((r) => r.endedAt)).toEqual([2, 4])
  })

  it('records a completion seen by both tabs once', () => {
    const store = memoryStore()
    const entry = { taskId: null, taskTitle: null, startedAt: 1, endedAt: 2, durationMs: 1 }
    new HistoryStore(store).add(entry)
    new HistoryStore(store).add(entry)
    expect(new HistoryStore(store).records).toHaveLength(1)
  })
})
