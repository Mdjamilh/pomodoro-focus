import type { HeatmapCell } from '../lib/history'
import { define, esc, shadow } from './base'

const CELL = 13
const GAP = 3
const STEP = CELL + GAP
const LEFT = 28
const TOP = 16
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const styles = `
  figure { margin: 0; overflow-x: auto; width: fit-content; max-width: 100%; }
  svg { display: block; max-width: 100%; height: auto; }
  text { fill: var(--muted); font-size: 9px; font-family: inherit; }
  rect { rx: 2.5px; stroke: var(--heat-stroke); stroke-width: 1; }
  .l0 { fill: var(--heat-0); }
  .l1 { fill: var(--heat-1); }
  .l2 { fill: var(--heat-2); }
  .l3 { fill: var(--heat-3); }
  .l4 { fill: var(--heat-4); }
  .future { opacity: 0.25; }
  .today { stroke: var(--fg); stroke-width: 1.5; }
  figcaption { display: flex; gap: 0.35rem; align-items: center; justify-content: flex-end; font-size: 0.75rem; margin-top: 0.4rem; }
  figcaption svg { display: inline; }
`

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Human label for one day, for <title> tooltips and screen readers. */
export function cellLabel(cell: HeatmapCell): string {
  const date = new Date(`${cell.date}T12:00:00`)
  const day = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `${day}: ${cell.count === 0 ? 'no pomodoros' : plural(cell.count, 'pomodoro')}`
}

/** Builds the heatmap SVG markup. Exported for tests. */
export function heatmapSvg(cells: readonly HeatmapCell[], todayKey: string): string {
  const weeks = cells.length ? Math.max(...cells.map((c) => c.week)) + 1 : 0
  const width = LEFT + weeks * STEP
  const height = TOP + 7 * STEP

  const monthLabels: string[] = []
  let lastMonth = -1
  for (const c of cells) {
    if (c.weekday !== 0) continue
    const month = Number(c.date.slice(5, 7)) - 1
    if (month !== lastMonth) {
      // Skip a label squeezed into the first column when the month started earlier.
      if (lastMonth !== -1 || Number(c.date.slice(8, 10)) <= 7) {
        monthLabels.push(`<text x="${LEFT + c.week * STEP}" y="10">${MONTHS[month]}</text>`)
      }
      lastMonth = month
    }
  }

  const dayLabels = [1, 3, 5]
    .map((d) => `<text x="0" y="${TOP + d * STEP + CELL - 2}">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}</text>`)
    .join('')

  const rects = cells
    .map((c) => {
      const cls = [`l${c.level}`, c.future ? 'future' : '', c.date === todayKey ? 'today' : ''].filter(Boolean).join(' ')
      return `<rect class="${cls}" x="${LEFT + c.week * STEP}" y="${TOP + c.weekday * STEP}" width="${CELL}" height="${CELL}" data-date="${c.date}" data-count="${c.count}"><title>${esc(cellLabel(c))}</title></rect>`
    })
    .join('')

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${monthLabels.join('')}${dayLabels}${rects}</svg>`
}

/**
 * <pf-heatmap>: a calendar of the last few months, one square per day,
 * darker for more pomodoros. Drawn as plain SVG so it needs no chart library.
 */
export class StreakHeatmap extends HTMLElement {
  #root: ShadowRoot
  #figure: HTMLElement

  constructor() {
    super()
    this.#root = shadow(
      this,
      styles,
      `<figure role="img"></figure>`)
    this.#figure = this.#root.querySelector('figure')!
  }

  render(cells: readonly HeatmapCell[], todayKey: string, summary: string): void {
    const legend = [0, 1, 2, 3, 4]
      .map((l) => `<svg width="${CELL}" height="${CELL}" aria-hidden="true"><rect class="l${l}" width="${CELL}" height="${CELL}"></rect></svg>`)
      .join('')
    this.#figure.setAttribute('aria-label', summary)
    this.#figure.innerHTML = `${heatmapSvg(cells, todayKey)}<figcaption class="muted" aria-hidden="true">Less ${legend} More</figcaption>`
  }
}

define('pf-heatmap', StreakHeatmap)

declare global {
  interface HTMLElementTagNameMap {
    'pf-heatmap': StreakHeatmap
  }
}
