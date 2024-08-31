/**
 * Pure Pomodoro state machine.
 *
 * Nothing in here counts ticks. Every function takes the current wall-clock
 * time (`now`, in milliseconds) and derives elapsed and remaining time from
 * the timestamps stored in the state. That is what keeps the timer correct
 * when the browser throttles timers in a background tab or the laptop sleeps:
 * whenever we look again, the arithmetic catches up in one step.
 */

export type Phase = 'work' | 'shortBreak' | 'longBreak'
export type Status = 'idle' | 'running' | 'paused'

export interface TimerConfig {
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** A long break replaces the short one after this many work sessions. */
  longBreakEvery: number
  autoStartBreaks: boolean
  autoStartWork: boolean
}

export interface TimerState {
  phase: Phase
  status: Status
  /** Wall-clock ms when the current running stretch began. Null unless running. */
  startedAt: number | null
  /** Milliseconds already spent in this phase before the current running stretch. */
  elapsed: number
  /** Work sessions completed since the last long break. */
  cycle: number
  /** Wall-clock ms when this phase was first started, used for history. */
  phaseStartedAt: number | null
}

export interface PhaseCompletion {
  phase: Phase
  startedAt: number
  endedAt: number
  durationMs: number
}

export interface AdvanceResult {
  state: TimerState
  completed: PhaseCompletion[]
}

export const DEFAULT_CONFIG: TimerConfig = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartWork: false,
}

const MINUTE = 60_000

/** Upper bound on phases replayed in one advance, so corrupt input cannot spin forever. */
const MAX_CATCH_UP = 1_000

export function initialState(): TimerState {
  return { phase: 'work', status: 'idle', startedAt: null, elapsed: 0, cycle: 0, phaseStartedAt: null }
}

export function phaseDuration(phase: Phase, config: TimerConfig): number {
  switch (phase) {
    case 'work':
      return config.workMinutes * MINUTE
    case 'shortBreak':
      return config.shortBreakMinutes * MINUTE
    case 'longBreak':
      return config.longBreakMinutes * MINUTE
  }
}

export function elapsedMs(state: TimerState, now: number): number {
  if (state.status !== 'running' || state.startedAt === null) return state.elapsed
  // A clock that moved backwards (manual change, NTP correction) must not add negative time.
  return state.elapsed + Math.max(0, now - state.startedAt)
}

export function remainingMs(state: TimerState, config: TimerConfig, now: number): number {
  return Math.max(0, phaseDuration(state.phase, config) - elapsedMs(state, now))
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === 'running') return state
  return { ...state, status: 'running', startedAt: now, phaseStartedAt: state.phaseStartedAt ?? now }
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state
  return { ...state, status: 'paused', elapsed: elapsedMs(state, now), startedAt: null }
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.status === 'running' ? pause(state, now) : start(state, now)
}

/** Rewinds the current phase to its full length and stops it. The cycle count is kept. */
export function reset(state: TimerState): TimerState {
  return { ...state, status: 'idle', startedAt: null, elapsed: 0, phaseStartedAt: null }
}

/** Which phase follows `phase`, given the cycle count after it finished. */
export function nextPhase(phase: Phase, cycle: number, config: TimerConfig): Phase {
  if (phase !== 'work') return 'work'
  return cycle > 0 && cycle % config.longBreakEvery === 0 ? 'longBreak' : 'shortBreak'
}

function shouldAutoStart(phase: Phase, config: TimerConfig): boolean {
  return phase === 'work' ? config.autoStartWork : config.autoStartBreaks
}

/**
 * Moves to the next phase without recording anything. Skipping a work session
 * does not count towards the long break.
 */
export function skip(state: TimerState, config: TimerConfig): TimerState {
  const cycle = state.phase === 'longBreak' ? 0 : state.cycle
  return {
    phase: nextPhase(state.phase, cycle, config),
    status: 'idle',
    startedAt: null,
    elapsed: 0,
    cycle,
    phaseStartedAt: null,
  }
}

/**
 * Brings the state up to date with `now`. If the running phase has ended it is
 * completed at its exact end time (not at `now`), and when the next phase
 * auto-starts it starts at that same instant. So a tab that slept through a
 * work session and a break replays both with correct timestamps.
 */
export function advance(state: TimerState, config: TimerConfig, now: number): AdvanceResult {
  const completed: PhaseCompletion[] = []
  let current = state

  for (let i = 0; i < MAX_CATCH_UP; i++) {
    if (current.status !== 'running' || current.startedAt === null) break
    const duration = phaseDuration(current.phase, config)
    const endsAt = current.startedAt + (duration - current.elapsed)
    if (now < endsAt) break

    completed.push({
      phase: current.phase,
      startedAt: current.phaseStartedAt ?? current.startedAt,
      endedAt: endsAt,
      durationMs: duration,
    })

    const cycle = current.phase === 'work' ? current.cycle + 1 : current.phase === 'longBreak' ? 0 : current.cycle
    const phase = nextPhase(current.phase, cycle, config)
    const auto = shouldAutoStart(phase, config)
    current = {
      phase,
      status: auto ? 'running' : 'idle',
      startedAt: auto ? endsAt : null,
      elapsed: 0,
      cycle,
      phaseStartedAt: auto ? endsAt : null,
    }
  }

  return { state: current, completed }
}
