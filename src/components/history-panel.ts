import {
  addDays,
  byTask,
  dayKey,
  dayTotal,
  heatmap,
  lastSevenDays,
  startOfDay,
  streaks,
  type DayTotal,
  type HistoryStore,
} from '../lib/history'
import { formatMinutes } from '../lib/format'
import { define, esc, shadow } from './base'
import './streak-heatmap'

const styles = `
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.6rem; margin: 0 0 1.25rem; }
  .stat { background: var(--surface-2); border-radius: 0.75rem; padding: 0.7rem 0.85rem; }
  .stat dt { font-size: 0.78rem; color: var(--muted); }
  .stat dd { margin: 0.15rem 0 0; font-size: 1.35rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  .stat dd small { font-size: 0.78rem; font-weight: 400; color: var(--muted); margin-left: 0.25rem; }
  h3 { font-size: 0.85rem; margin: 1.25rem 0 0.5rem; color: var(--muted); font-weight: 600; }
  .week svg { width: 100%; max-width: 40rem; height: auto; display: block; }
  .week rect { fill: var(--accent); }
  .week rect.zero { fill: var(--surface-2); }
  .week text { fill: var(--muted); font-size: 10px; font-family: inherit; }
  .week text.value { fill: var(--fg); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.3rem 0; border-bottom: 1px solid var(--border); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .actions { margin-top: 1rem; text-align: right; }
  .charts { display: grid; gap: 0 2rem; }
  .charts > section { min-width: 0; }
  @media (min-width: 60rem) {
    .charts { grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
  }
  .actions button { font-size: 0.85rem; padding: 0.3rem 0.8rem; }
`

/** Seven-day bar chart as SVG. Exported for tests. */
export function weekChart(days: readonly DayTotal[]): string {
  const w = 560
  const h = 120
  const barW = 44
  const gap = (w - barW * days.length) / (days.length + 1)
  const max = Math.max(1, ...days.map((d) => d.count))
  const bars = days
    .map((d, i) => {
      const x = gap + i * (barW + gap)
      const bh = d.count === 0 ? 3 : Math.max(6, (d.count / max) * 76)
      const y = 96 - bh
      const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })
      return `
        <rect class="${d.count === 0 ? 'zero' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" rx="4"></rect>
        <text x="${(x + barW / 2).toFixed(1)}" y="114" text-anchor="middle">${label}</text>
        ${d.count ? `<text class="value" x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${d.count}</text>` : ''}`
    })
    .join('')
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${bars}</svg>`
}

/** <pf-history>: today, this week, streaks, the heatmap and a per-task table. */
export class HistoryPanel extends HTMLElement {
  #root: ShadowRoot
  #body: HTMLElement
  #history: HistoryStore | null = null
  now: () => number = Date.now
  weeks = 26

  constructor() {
    super()
    this.#root = shadow(
      this,
      styles,
      `<h2>History</h2><div class="body"></div>`)
    this.#body = this.#root.querySelector('.body')!
    this.#root.addEventListener('click', (e) => {
      const button = (e.target as Element).closest('button[data-op="clear"]')
      if (button && this.#history && confirm('Delete all history? This cannot be undone.')) this.#history.clear()
    })
  }

  set history(history: HistoryStore) {
    this.#history?.removeEventListener('change', this.#render)
    this.#history = history
    history.addEventListener('change', this.#render)
    this.#render()
  }

  refresh(): void {
    this.#render()
  }

  #render = (): void => {
    const records = this.#history?.records ?? []
    const now = this.now()
    const today = dayTotal(records, now)
    const week = lastSevenDays(records, now)
    const weekCount = week.reduce((n, d) => n + d.count, 0)
    const weekMinutes = week.reduce((n, d) => n + d.minutes, 0)
    const { current, longest } = streaks(records, now)
    const tasks = byTask(records, addDays(startOfDay(now), -6).getTime())

    const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
    this.#body.innerHTML = `
      <dl class="stats">
        <div class="stat" data-stat="today"><dt>Today</dt><dd>${today.count}<small>${formatMinutes(today.minutes)}</small></dd></div>
        <div class="stat" data-stat="week"><dt>Last 7 days</dt><dd>${weekCount}<small>${formatMinutes(weekMinutes)}</small></dd></div>
        <div class="stat" data-stat="streak"><dt>Current streak</dt><dd>${days(current)}</dd></div>
        <div class="stat" data-stat="longest"><dt>Longest streak</dt><dd>${days(longest)}</dd></div>
      </dl>
      <div class="charts">
      <section>
      <h3 id="week-heading">Pomodoros per day</h3>
      <figure class="week" role="img" aria-labelledby="week-heading" aria-describedby="week-desc" style="margin:0">
        ${weekChart(week)}
        <figcaption id="week-desc" class="visually-hidden">${week.map((d) => `${d.date}: ${d.count}`).join(', ')}</figcaption>
      </figure>
      </section>
      <section>
      <h3>Streak calendar</h3>
      <pf-heatmap></pf-heatmap>
      </section>
      </div>
      <h3>By task, last 7 days</h3>
      ${
        tasks.length
          ? `<table><thead><tr><th>Task</th><th class="num">Pomodoros</th><th class="num">Time</th></tr></thead><tbody>
            ${tasks.map((t) => `<tr><td>${esc(t.title)}</td><td class="num">${t.count}</td><td class="num">${formatMinutes(t.minutes)}</td></tr>`).join('')}
            </tbody></table>`
          : `<p class="muted">Finish a focus session to see it here.</p>`
      }
      ${records.length ? `<div class="actions"><button data-op="clear">Clear history</button></div>` : ''}
    `
    const active = records.filter((r) => r.endedAt >= addDays(startOfDay(now), -this.weeks * 7).getTime())
    const activeDays = new Set(active.map((r) => dayKey(r.endedAt))).size
    this.#root
      .querySelector('pf-heatmap')!
      .render(heatmap(records, now, this.weeks), dayKey(now), `Streak calendar: pomodoros on ${days(activeDays)} in the last ${this.weeks} weeks. Current streak ${days(current)}.`)
  }
}

define('pf-history', HistoryPanel)

declare global {
  interface HTMLElementTagNameMap {
    'pf-history': HistoryPanel
  }
}
