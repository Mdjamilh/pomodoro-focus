import { isRecord, newId, readJSON, writeJSON, type KeyValueStore } from './storage'

/** One finished work session. Breaks are not recorded. */
export interface SessionRecord {
  id: string
  taskId: string | null
  /** Title at the time, so history still reads well after a task is deleted. */
  taskTitle: string | null
  startedAt: number
  endedAt: number
  durationMs: number
}

export interface DayTotal {
  date: string
  count: number
  minutes: number
}

export interface HeatmapCell extends DayTotal {
  /** 0 = nothing, 4 = busiest. */
  level: 0 | 1 | 2 | 3 | 4
  week: number
  weekday: number
  future: boolean
}

const KEY = 'history'
/** About two years of heavy use. Old entries are dropped first. */
export const MAX_RECORDS = 5_000

/**
 * Local calendar date as YYYY-MM-DD. Uses local date parts on purpose: a
 * session at 23:30 belongs to "today" for the person using the app, whatever
 * UTC says.
 */
export function dayKey(ts: number | Date): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts: number | Date): Date {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Moves by calendar days. Adding 24 hours of milliseconds is wrong on the two
 * days a year that are 23 or 25 hours long, so we go through setDate.
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function totalsByDay(records: readonly SessionRecord[]): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>()
  for (const r of records) {
    const date = dayKey(r.endedAt)
    const t = map.get(date) ?? { date, count: 0, minutes: 0 }
    t.count += 1
    t.minutes += r.durationMs / 60_000
    map.set(date, t)
  }
  return map
}

export function dayTotal(records: readonly SessionRecord[], day: number | Date): DayTotal {
  const date = dayKey(day)
  return totalsByDay(records).get(date) ?? { date, count: 0, minutes: 0 }
}

/** The last seven days ending today, oldest first. */
export function lastSevenDays(records: readonly SessionRecord[], now: number): DayTotal[] {
  const totals = totalsByDay(records)
  const today = startOfDay(now)
  const days: DayTotal[] = []
  for (let i = 6; i >= 0; i--) {
    const date = dayKey(addDays(today, -i))
    days.push(totals.get(date) ?? { date, count: 0, minutes: 0 })
  }
  return days
}

export interface Streaks {
  current: number
  longest: number
}

/**
 * Consecutive days with at least one finished session. The current streak
 * still counts if today is empty but yesterday was not, because the day is
 * not over yet.
 */
export function streaks(records: readonly SessionRecord[], now: number): Streaks {
  const active = new Set(records.map((r) => dayKey(r.endedAt)))
  if (active.size === 0) return { current: 0, longest: 0 }

  const today = startOfDay(now)
  let cursor = active.has(dayKey(today)) ? today : addDays(today, -1)
  let current = 0
  while (active.has(dayKey(cursor))) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  const sorted = [...active].sort()
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`)
    run = dayKey(addDays(prev, 1)) === sorted[i] ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return { current, longest: Math.max(longest, current) }
}

export function levelFor(count: number): HeatmapCell['level'] {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

/**
 * Cells for a GitHub-style calendar: `weeks` columns, Sunday at the top, the
 * last column containing today. Days after today in that column are marked
 * `future` so they can be drawn faintly.
 */
export function heatmap(records: readonly SessionRecord[], now: number, weeks = 20): HeatmapCell[] {
  const totals = totalsByDay(records)
  const today = startOfDay(now)
  const firstSunday = addDays(today, -today.getDay() - (weeks - 1) * 7)
  const todayKey = dayKey(today)
  const cells: HeatmapCell[] = []
  let futureStarted = false
  for (let week = 0; week < weeks; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = dayKey(addDays(firstSunday, week * 7 + weekday))
      const t = totals.get(date) ?? { date, count: 0, minutes: 0 }
      cells.push({ ...t, level: levelFor(t.count), week, weekday, future: futureStarted })
      if (date === todayKey) futureStarted = true
    }
  }
  return cells
}

export interface TaskTotal {
  taskId: string | null
  title: string
  count: number
  minutes: number
}

/** Sessions per task since `since`, busiest first. */
export function byTask(records: readonly SessionRecord[], since: number): TaskTotal[] {
  const map = new Map<string, TaskTotal>()
  for (const r of records) {
    if (r.endedAt < since) continue
    const key = r.taskId ?? ''
    const t = map.get(key) ?? { taskId: r.taskId, title: r.taskTitle ?? 'No task', count: 0, minutes: 0 }
    t.count += 1
    t.minutes += r.durationMs / 60_000
    if (r.taskTitle) t.title = r.taskTitle
    map.set(key, t)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}

function validRecord(v: unknown): SessionRecord | null {
  if (!isRecord(v) || typeof v.id !== 'string') return null
  const { startedAt, endedAt, durationMs } = v
  if (typeof startedAt !== 'number' || typeof endedAt !== 'number' || typeof durationMs !== 'number') return null
  return {
    id: v.id,
    taskId: typeof v.taskId === 'string' ? v.taskId : null,
    taskTitle: typeof v.taskTitle === 'string' ? v.taskTitle : null,
    startedAt,
    endedAt,
    durationMs,
  }
}

function validList(v: unknown): SessionRecord[] | null {
  if (!Array.isArray(v)) return null
  return v.map(validRecord).filter((r): r is SessionRecord => r !== null)
}

export class HistoryStore extends EventTarget {
  #records: SessionRecord[]
  #store: KeyValueStore

  constructor(store: KeyValueStore) {
    super()
    this.#store = store
    this.#records = readJSON(store, KEY, [], validList)
  }

  get records(): readonly SessionRecord[] {
    return this.#records
  }

  add(entry: Omit<SessionRecord, 'id'>): SessionRecord {
    const record = { ...entry, id: newId() }
    // The same completion can arrive twice (two tabs, or a replay after reload).
    const duplicate = this.#records.find((r) => r.endedAt === record.endedAt && r.startedAt === record.startedAt)
    if (duplicate) return duplicate
    this.#records = [...this.#records, record].slice(-MAX_RECORDS)
    this.#save()
    return record
  }

  countForTask(taskId: string): number {
    return this.#records.filter((r) => r.taskId === taskId).length
  }

  clear(): void {
    this.#records = []
    this.#save()
  }

  #save(): void {
    writeJSON(this.#store, KEY, this.#records)
    this.dispatchEvent(new Event('change'))
  }
}
