import {
  advance,
  initialState,
  pause,
  phaseDuration,
  remainingMs,
  reset,
  skip,
  start,
  type Phase,
  type PhaseCompletion,
  type Status,
  type TimerConfig,
  type TimerState,
} from './engine'
import { isRecord, readJSON, writeJSON, type KeyValueStore } from '../lib/storage'

export interface TimerSnapshot {
  phase: Phase
  status: Status
  remainingMs: number
  durationMs: number
  cycle: number
  longBreakEvery: number
}

export interface CompletionDetail extends PhaseCompletion {
  /** True when the phase ended a while ago, for example while the app was closed. */
  late: boolean
  next: TimerSnapshot
}

export interface ControllerOptions {
  /** Wall clock. Date.now survives reloads; performance.now would restart at zero. */
  now?: () => number
  store?: KeyValueStore
  /** Used to tell whether the page is hidden, so we can switch tick strategy. */
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
}

const STATE_KEY = 'timer'
const LATE_AFTER_MS = 5_000

function validState(v: unknown): TimerState | null {
  if (!isRecord(v)) return null
  const phases: Phase[] = ['work', 'shortBreak', 'longBreak']
  const statuses: Status[] = ['idle', 'running', 'paused']
  if (!phases.includes(v.phase as Phase) || !statuses.includes(v.status as Status)) return null
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
  if (!num(v.elapsed) || !num(v.cycle)) return null
  if (v.startedAt !== null && !num(v.startedAt)) return null
  if (v.phaseStartedAt !== null && !num(v.phaseStartedAt)) return null
  if (v.status === 'running' && v.startedAt === null) return null
  return v as unknown as TimerState
}

/**
 * Wraps the pure engine with a clock, a single scheduled timeout and
 * persistence. It emits `change` whenever the visible state may differ and
 * `complete` once per finished phase.
 *
 * Scheduling: while the page is visible we wake up at each whole-second
 * boundary so the display changes exactly when the rounded value does. While
 * it is hidden we stop ticking and set one timeout for the end of the phase.
 * Browsers clamp chained background timers (Chrome to once a minute after a
 * while), but the timestamp maths does not care how late we wake up.
 */
export class TimerController extends EventTarget {
  #state: TimerState
  #config: TimerConfig
  #now: () => number
  #store: KeyValueStore | undefined
  #doc: ControllerOptions['doc']
  #timeout: ReturnType<typeof setTimeout> | undefined
  #onVisibility = () => this.sync()

  constructor(config: TimerConfig, options: ControllerOptions = {}) {
    super()
    this.#config = config
    this.#now = options.now ?? Date.now
    this.#store = options.store
    this.#doc = options.doc
    this.#state = this.#store ? readJSON(this.#store, STATE_KEY, initialState(), validState) : initialState()
    this.#doc?.addEventListener('visibilitychange', this.#onVisibility)
  }

  get state(): TimerState {
    return this.#state
  }

  get config(): TimerConfig {
    return this.#config
  }

  snapshot(): TimerSnapshot {
    const now = this.#now()
    return {
      phase: this.#state.phase,
      status: this.#state.status,
      remainingMs: remainingMs(this.#state, this.#config, now),
      durationMs: phaseDuration(this.#state.phase, this.#config),
      cycle: this.#state.cycle,
      longBreakEvery: this.#config.longBreakEvery,
    }
  }

  start(): void {
    this.#set(start(this.#state, this.#now()))
  }

  pause(): void {
    this.#set(pause(this.#state, this.#now()))
  }

  toggle(): void {
    if (this.#state.status === 'running') this.pause()
    else this.start()
  }

  reset(): void {
    this.#set(reset(this.#state))
  }

  skip(): void {
    this.#set(skip(this.#state, this.#config))
  }

  setConfig(config: TimerConfig): void {
    this.#config = config
    this.sync()
    this.#emitChange()
  }

  /**
   * Catches the state up with the clock and reschedules. Safe to call at any
   * time; main.ts calls it on visibilitychange, focus and pageshow too.
   */
  sync(): void {
    const now = this.#now()
    const { state, completed } = advance(this.#state, this.#config, now)
    if (completed.length > 0) {
      this.#state = state
      this.#persist()
      const next = this.snapshot()
      for (const c of completed) {
        const detail: CompletionDetail = { ...c, late: now - c.endedAt > LATE_AFTER_MS, next }
        this.dispatchEvent(new CustomEvent('complete', { detail }))
      }
    }
    this.#emitChange()
    this.#schedule()
  }

  dispose(): void {
    clearTimeout(this.#timeout)
    this.#doc?.removeEventListener('visibilitychange', this.#onVisibility)
  }

  #set(next: TimerState): void {
    if (next === this.#state) return
    this.#state = next
    this.#persist()
    this.sync()
  }

  #persist(): void {
    if (this.#store) writeJSON(this.#store, STATE_KEY, this.#state)
  }

  #emitChange(): void {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }))
  }

  #schedule(): void {
    clearTimeout(this.#timeout)
    this.#timeout = undefined
    if (this.#state.status !== 'running') return
    const remaining = remainingMs(this.#state, this.#config, this.#now())
    const hidden = this.#doc?.visibilityState === 'hidden'
    // Next whole-second boundary, or the end of the phase when nobody is looking.
    const delay = hidden ? remaining : remaining % 1000 || 1000
    this.#timeout = setTimeout(() => this.sync(), Math.max(0, Math.min(delay, remaining)))
  }
}
