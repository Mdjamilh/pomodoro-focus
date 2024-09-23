import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/components/timer-display'
import '../src/components/task-list'
import '../src/components/history-panel'
import { heatmapSvg, cellLabel } from '../src/components/streak-heatmap'
import { weekChart } from '../src/components/history-panel'
import { TaskStore } from '../src/lib/tasks'
import { HistoryStore, heatmap } from '../src/lib/history'
import { memoryStore } from '../src/lib/storage'
import type { TimerSnapshot } from '../src/timer/controller'

const MIN = 60_000

afterEach(() => {
  document.body.innerHTML = ''
})

function snap(over: Partial<TimerSnapshot> = {}): TimerSnapshot {
  return { phase: 'work', status: 'idle', remainingMs: 25 * MIN, durationMs: 25 * MIN, cycle: 0, longBreakEvery: 4, ...over }
}

describe('<pf-timer>', () => {
  it('renders the time, phase and button label', () => {
    const el = document.createElement('pf-timer')
    document.body.append(el)
    el.update(snap({ status: 'running', remainingMs: 12 * MIN + 30_000, cycle: 2 }), 'Write <b>docs</b>')
    const root = el.shadowRoot!
    expect(root.querySelector('.time')!.textContent).toBe('12:30')
    expect(root.querySelector('[role="timer"]')!.getAttribute('aria-label')).toBe('12 minutes 30 seconds left')
    expect(root.querySelector('[data-action="toggle"]')!.textContent).toContain('Pause')
    expect(root.querySelectorAll('.cycle li.done')).toHaveLength(2)
    // Task titles are escaped, not injected as HTML.
    expect(root.querySelector('.task strong')!.textContent).toBe('Write <b>docs</b>')
    expect(el.dataset.status).toBe('running')
  })

  it('keeps the timer out of the live region so it is not read every second', () => {
    const el = document.createElement('pf-timer')
    document.body.append(el)
    expect(el.shadowRoot!.querySelector('[role="timer"]')!.getAttribute('aria-live')).toBe('off')
  })

  it('reports button clicks as timer-action events', () => {
    const el = document.createElement('pf-timer')
    document.body.append(el)
    const onAction = vi.fn()
    document.addEventListener('timer-action', (e) => onAction((e as CustomEvent).detail))
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="skip"]')!.click()
    expect(onAction).toHaveBeenCalledWith('skip')
  })
})

describe('<pf-tasks>', () => {
  it('adds tasks through the form and shows pomodoro counts', () => {
    const store = new TaskStore(memoryStore())
    const el = document.createElement('pf-tasks')
    el.countFor = () => 3
    document.body.append(el)
    el.store = store
    const root = el.shadowRoot!
    const input = root.querySelector<HTMLInputElement>('#new-task')!
    input.value = 'Read chapter 4'
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(store.tasks.map((t) => t.title)).toEqual(['Read chapter 4'])
    expect(input.value).toBe('')
    expect(root.querySelector('li .title')!.textContent).toBe('Read chapter 4')
    expect(root.querySelector('li .count')!.textContent).toBe('3')
    expect(root.querySelector<HTMLInputElement>('input[name="active"]')!.checked).toBe(true)
  })

  it('marks tasks done and deletes them', () => {
    const store = new TaskStore(memoryStore())
    const task = store.add('A')!
    const el = document.createElement('pf-tasks')
    document.body.append(el)
    el.store = store
    const root = el.shadowRoot!
    const box = root.querySelector<HTMLInputElement>('input[name="done"]')!
    box.checked = true
    box.dispatchEvent(new Event('change', { bubbles: true }))
    expect(store.tasks[0].done).toBe(true)
    root.querySelector<HTMLButtonElement>(`li[data-id="${task.id}"] [data-op="remove"]`)!.click()
    expect(store.tasks).toHaveLength(0)
  })
})

describe('<pf-history>', () => {
  it('shows today, streak and a heatmap cell per day', () => {
    vi.useFakeTimers()
    const now = new Date('2026-10-23T15:00:00').getTime()
    vi.setSystemTime(now)
    const history = new HistoryStore(memoryStore())
    history.add({ taskId: 't', taskTitle: 'Thesis', startedAt: now - 2 * 60 * MIN, endedAt: now - 95 * MIN, durationMs: 25 * MIN })
    const el = document.createElement('pf-history')
    el.weeks = 4
    document.body.append(el)
    el.history = history
    const root = el.shadowRoot!
    expect(root.querySelector('[data-stat="today"] dd')!.textContent).toContain('1')
    expect(root.querySelector('[data-stat="streak"] dd')!.textContent).toBe('1 day')
    const heat = root.querySelector('pf-heatmap')!.shadowRoot!
    expect(heat.querySelectorAll('rect[data-date]')).toHaveLength(28)
    expect(heat.querySelector('rect[data-date="2026-10-23"]')!.getAttribute('data-count')).toBe('1')
    expect(root.querySelector('tbody td')!.textContent).toBe('Thesis')
    vi.useRealTimers()
  })
})

describe('SVG builders', () => {
  it('labels heatmap days for tooltips', () => {
    expect(cellLabel({ date: '2026-10-23', count: 2, minutes: 50, level: 1, week: 0, weekday: 5, future: false })).toBe(
      'Fri, Oct 23, 2026: 2 pomodoros',
    )
  })

  it('marks today and future days in the heatmap', () => {
    const now = new Date('2026-10-23T15:00:00').getTime()
    const svg = heatmapSvg(heatmap([], now, 2), '2026-10-23')
    expect(svg).toContain('class="l0 today"')
    expect(svg).toMatch(/class="l0 future"[^>]*data-date="2026-10-24"/)
  })

  it('draws seven bars with values on busy days', () => {
    const days = ['17', '18', '19', '20', '21', '22', '23'].map((d, i) => ({ date: `2026-10-${d}`, count: i === 6 ? 4 : 0, minutes: 0 }))
    const svg = weekChart(days)
    expect(svg.match(/<rect/g)).toHaveLength(7)
    expect(svg).toContain('>4</text>')
  })
})
