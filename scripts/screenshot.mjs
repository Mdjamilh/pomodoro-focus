// Takes the README screenshot with made-up demo history so the charts have
// something to show. Usage: node scripts/screenshot.mjs [url] [out]
import { chromium } from '@playwright/test'

const [url = 'http://localhost:47270', out = 'docs/screenshot.png'] = process.argv.slice(2)
const NOW = new Date('2026-10-23T10:40:00')

// Deterministic pseudo-random numbers so the picture is the same every run.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const tasks = [
  { id: 't1', title: 'Write chapter 3 draft', done: false, createdAt: 0, estimate: null },
  { id: 't2', title: 'Review pull requests', done: false, createdAt: 0, estimate: null },
  { id: 't3', title: 'Study for the statistics exam', done: true, createdAt: 0, estimate: null },
]
const history = []
for (let d = 150; d >= 0; d--) {
  const day = new Date(NOW)
  day.setDate(day.getDate() - d)
  const weekend = day.getDay() === 0 || day.getDay() === 6
  // A recent unbroken run for the streak, gaps further back.
  const count = d <= 9 ? 1 + Math.floor(rand() * 6) : rand() < (weekend ? 0.3 : 0.7) ? Math.floor(rand() * 9) : 0
  for (let i = 0; i < (d === 0 ? 3 : count); i++) {
    const end = new Date(day)
    end.setHours(9 + i, 25, 0, 0)
    const task = tasks[Math.floor(rand() * tasks.length)]
    history.push({ id: `${d}-${i}`, taskId: task.id, taskTitle: task.title, startedAt: end.getTime() - 25 * 60000, endedAt: end.getTime(), durationMs: 25 * 60000 })
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
await page.clock.install({ time: new Date(NOW.getTime() - 60_000) })
await page.addInitScript(
  ([t, h]) => {
    if (localStorage.getItem('pomodoro-focus:seeded')) return
    localStorage.setItem('pomodoro-focus:tasks', JSON.stringify({ tasks: t, activeId: 't1' }))
    localStorage.setItem('pomodoro-focus:history', JSON.stringify(h))
    localStorage.setItem('pomodoro-focus:seeded', '1')
  },
  [tasks, history],
)
await page.goto(url)
await page.clock.pauseAt(NOW)
await page.getByRole('heading', { name: 'Pomodoro Focus' }).click()
await page.keyboard.press('Space')
await page.clock.fastForward('07:48')
// Let the ring's CSS transition settle; it runs on real time, not the fake clock.
await page.waitForTimeout(1500)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(`wrote ${out}`)
