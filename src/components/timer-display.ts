import type { TimerSnapshot } from '../timer/controller'
import { PHASE_LABEL, formatClock, formatSpoken } from '../lib/format'
import { define, emit, esc, shadow } from './base'

export type TimerAction = 'toggle' | 'reset' | 'skip'

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const styles = `
  :host { text-align: center; }
  .phase { font-size: 0.95rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin: 0; }
  .ring { position: relative; width: min(72vw, 260px); aspect-ratio: 1; margin: 1rem auto; }
  svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .track { stroke: var(--surface-2); }
  .progress { stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke var(--speed) ease; }
  .time {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: clamp(2.6rem, 12vw, 3.6rem); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  }
  :host([data-status='paused']) .time { opacity: 0.6; }
  :host([data-status='running']) .ring { animation: breathe 4s ease-in-out infinite; }
  @keyframes breathe { 50% { transform: scale(1.015); } }
  @media (prefers-reduced-motion: reduce) {
    .progress { transition: none; }
    :host([data-status='running']) .ring { animation: none; }
  }
  .controls { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: transparent; min-width: 8rem; font-weight: 600; }
  .primary:hover { filter: brightness(1.05); }
  .cycle { display: flex; gap: 0.4rem; justify-content: center; margin: 1rem 0 0; padding: 0; list-style: none; }
  .cycle li { width: 0.6rem; height: 0.6rem; border-radius: 50%; border: 2px solid var(--accent); }
  .cycle li.done { background: var(--accent); }
  .task { margin: 0.75rem 0 0; min-height: 1.5em; }
  kbd { font: inherit; font-size: 0.75em; opacity: 0.7; margin-left: 0.35rem; }
`

/**
 * <pf-timer>: the big clock, the progress ring and the main buttons.
 * It only renders what it is given and reports clicks as `timer-action`
 * events; the controller owns the actual state.
 */
export class TimerDisplay extends HTMLElement {
  #root: ShadowRoot
  #els!: {
    phase: HTMLElement
    time: HTMLElement
    progress: SVGCircleElement
    toggle: HTMLButtonElement
    cycle: HTMLElement
    task: HTMLElement
  }

  constructor() {
    super()
    this.#root = shadow(
      this,
      styles,
      `
      <p class="phase" id="phase">Focus</p>
      <div class="ring">
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <circle class="track" cx="100" cy="100" r="${RADIUS}" fill="none" stroke-width="10"></circle>
          <circle class="progress" cx="100" cy="100" r="${RADIUS}" fill="none" stroke-width="10"
            stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="0"></circle>
        </svg>
        <div class="time" role="timer" aria-live="off" aria-describedby="phase">25:00</div>
      </div>
      <div class="controls">
        <button class="primary" data-action="toggle">Start<kbd aria-hidden="true">Space</kbd></button>
        <button data-action="reset" aria-keyshortcuts="R">Reset</button>
        <button data-action="skip" aria-keyshortcuts="S">Skip</button>
      </div>
      <ul class="cycle" aria-label="Sessions until the long break"></ul>
      <p class="task muted"></p>
    `,
    )
    const $ = <T extends Element>(sel: string) => this.#root.querySelector(sel) as T
    this.#els = {
      phase: $('.phase'),
      time: $('.time'),
      progress: $('.progress'),
      toggle: $('[data-action="toggle"]'),
      cycle: $('.cycle'),
      task: $('.task'),
    }
    this.#els.toggle.setAttribute('aria-keyshortcuts', 'Space')
    this.#root.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button[data-action]')
      if (button) emit<TimerAction>(this, 'timer-action', button.dataset.action as TimerAction)
    })
  }

  update(snap: TimerSnapshot, taskTitle: string | null): void {
    this.dataset.phase = snap.phase
    this.dataset.status = snap.status
    const { phase, time, progress, toggle, cycle, task } = this.#els

    phase.textContent = PHASE_LABEL[snap.phase]
    time.textContent = formatClock(snap.remainingMs)
    time.setAttribute('aria-label', `${formatSpoken(snap.remainingMs)} left`)

    const fraction = snap.durationMs > 0 ? 1 - snap.remainingMs / snap.durationMs : 0
    progress.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * fraction).toFixed(2))

    const verb = snap.status === 'running' ? 'Pause' : snap.status === 'paused' ? 'Resume' : 'Start'
    toggle.firstChild!.textContent = verb

    const done = Math.min(snap.cycle, snap.longBreakEvery)
    cycle.innerHTML = Array.from({ length: snap.longBreakEvery }, (_, i) => `<li class="${i < done ? 'done' : ''}"></li>`).join('')
    cycle.setAttribute('aria-label', `${done} of ${snap.longBreakEvery} sessions until the long break`)

    task.innerHTML = taskTitle ? `Working on <strong>${esc(taskTitle)}</strong>` : 'No task selected'
  }
}

define('pf-timer', TimerDisplay)

declare global {
  interface HTMLElementTagNameMap {
    'pf-timer': TimerDisplay
  }
}
