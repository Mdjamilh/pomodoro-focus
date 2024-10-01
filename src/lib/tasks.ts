import { isRecord, newId, readJSON, writeJSON, type KeyValueStore } from './storage'

export interface Task {
  id: string
  title: string
  done: boolean
  createdAt: number
  /** Optional estimate in pomodoros, shown as "2 / 4". */
  estimate: number | null
}

interface TaskData {
  tasks: Task[]
  activeId: string | null
}

const KEY = 'tasks'
export const MAX_TITLE = 120

function validTask(v: unknown): Task | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.title !== 'string') return null
  const estimate = typeof v.estimate === 'number' && v.estimate > 0 ? Math.round(v.estimate) : null
  return {
    id: v.id,
    title: v.title.slice(0, MAX_TITLE),
    done: v.done === true,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    estimate,
  }
}

function validData(v: unknown): TaskData | null {
  if (!isRecord(v) || !Array.isArray(v.tasks)) return null
  const tasks = v.tasks.map(validTask).filter((t): t is Task => t !== null)
  const activeId = typeof v.activeId === 'string' && tasks.some((t) => t.id === v.activeId) ? v.activeId : null
  return { tasks, activeId }
}

/** Task list with an "active" task that new pomodoros are attributed to. */
export class TaskStore extends EventTarget {
  #data: TaskData
  #store: KeyValueStore
  #now: () => number

  constructor(store: KeyValueStore, now: () => number = Date.now) {
    super()
    this.#store = store
    this.#now = now
    this.#data = readJSON(store, KEY, { tasks: [], activeId: null }, validData)
  }

  /** Re-reads storage, e.g. after another tab wrote to it. */
  reload(): void {
    this.#data = readJSON(this.#store, KEY, { tasks: [], activeId: null }, validData)
    this.dispatchEvent(new Event('change'))
  }

  get tasks(): readonly Task[] {
    return this.#data.tasks
  }

  get activeId(): string | null {
    return this.#data.activeId
  }

  get active(): Task | null {
    return this.#data.tasks.find((t) => t.id === this.#data.activeId) ?? null
  }

  add(title: string, estimate: number | null = null): Task | null {
    const clean = title.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE)
    if (!clean) return null
    this.#data = readJSON(this.#store, KEY, this.#data, validData)
    const task: Task = { id: newId(), title: clean, done: false, createdAt: this.#now(), estimate }
    const tasks = [...this.#data.tasks, task]
    // The first task you add becomes the one you are working on.
    this.#commit({ tasks, activeId: this.#data.activeId ?? task.id })
    return task
  }

  rename(id: string, title: string): void {
    const clean = title.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE)
    if (!clean) return
    this.#update(id, (t) => ({ ...t, title: clean }))
  }

  toggleDone(id: string): void {
    const task = this.#data.tasks.find((t) => t.id === id)
    if (!task) return
    const tasks = this.#data.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    // Finishing the active task frees the timer from it.
    const activeId = !task.done && this.#data.activeId === id ? null : this.#data.activeId
    this.#commit({ tasks, activeId })
  }

  remove(id: string): void {
    const tasks = this.#data.tasks.filter((t) => t.id !== id)
    this.#commit({ tasks, activeId: this.#data.activeId === id ? null : this.#data.activeId })
  }

  setActive(id: string | null): void {
    if (id !== null && !this.#data.tasks.some((t) => t.id === id && !t.done)) return
    this.#commit({ ...this.#data, activeId: id })
  }

  clearDone(): void {
    this.#commit({ ...this.#data, tasks: this.#data.tasks.filter((t) => !t.done) })
  }

  #update(id: string, fn: (t: Task) => Task): void {
    this.#commit({ ...this.#data, tasks: this.#data.tasks.map((t) => (t.id === id ? fn(t) : t)) })
  }

  #commit(data: TaskData): void {
    this.#data = data
    writeJSON(this.#store, KEY, data)
    this.dispatchEvent(new Event('change'))
  }
}
