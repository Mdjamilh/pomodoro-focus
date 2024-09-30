import { expect, test, type Page } from '@playwright/test'

const timerShadow = (page: Page) => page.locator('pf-timer')

test.describe('a full focus session', () => {
  test('fast-forwards 25 minutes, switches to a break and records history', async ({ page }) => {
    // Install a fake clock before the app loads so Date.now and setTimeout are both controlled.
    await page.clock.install({ time: new Date('2026-10-23T08:59:00') })
    await page.goto('/')

    // Add a task so the session is attributed to it.
    await page.getByLabel('New task').fill('Write the quarterly report')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByLabel('Focus on Write the quarterly report')).toBeChecked()

    const timer = timerShadow(page)
    await expect(timer.getByRole('timer')).toHaveText('25:00')
    // Freeze the clock at a known instant, then start. Focus is still in the
    // task field, where Space types a space, so move focus out first.
    await page.clock.pauseAt(new Date('2026-10-23T09:05:00'))
    await page.getByRole('heading', { name: 'Pomodoro Focus' }).click()
    await page.keyboard.press('Space')
    await expect(timer.getByRole('button', { name: /Pause/ })).toBeVisible()

    await page.clock.fastForward('10:00')
    await expect(timer.getByRole('timer')).toHaveText('15:00')
    await expect(page).toHaveTitle('15:00 Focus | Pomodoro Focus')

    await page.clock.fastForward('15:00')

    // Phase change: the break auto-starts from the exact end of the session.
    await expect(timer.locator('.phase')).toHaveText('Short break')
    await expect(timer.getByRole('timer')).toHaveText('05:00')
    await expect(page).toHaveTitle(/Short break \| Pomodoro Focus$/)
    await page.clock.runFor(100)
    await expect(page.getByRole('status')).toHaveText(/Focus session complete\. Short break started/)

    // History: one pomodoro today, credited to the task, and a filled heatmap cell.
    const history = page.locator('pf-history')
    await expect(history.locator('[data-stat="today"] dd')).toContainText('1')
    await expect(history.locator('[data-stat="today"] dd')).toContainText('25 min')
    await expect(history.locator('[data-stat="streak"] dd')).toHaveText('1 day')
    await expect(history.getByRole('cell', { name: 'Write the quarterly report' })).toBeVisible()
    await expect(history.locator('pf-heatmap rect[data-date="2026-10-23"]')).toHaveAttribute('data-count', '1')
    await expect(page.locator('pf-tasks li .count')).toHaveText('1')

    // It survives a reload, because everything lives in localStorage.
    await page.reload()
    await expect(page.locator('pf-history [data-stat="today"] dd')).toContainText('1')
  })

  test('catches up when the tab was asleep past the end of a session', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-23T08:59:00') })
    await page.goto('/')
    await page.clock.pauseAt(new Date('2026-10-23T09:00:00'))
    await page.keyboard.press('Space')

    // Jump 27 minutes in one step, the way a sleeping laptop or a throttled tab
    // experiences time: no per-second ticks in between, just a late wake-up.
    await page.clock.pauseAt(new Date('2026-10-23T09:27:00'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))

    const timer = timerShadow(page)
    await expect(timer.locator('.phase')).toHaveText('Short break')
    // The break began at 09:25, so 3 minutes are left, not 5.
    await expect(timer.getByRole('timer')).toHaveText('03:00')
    await expect(page.locator('pf-history [data-stat="today"] dd')).toContainText('1')
  })
})

test('keyboard shortcuts start, reset and skip', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T08:59:00') })
  await page.goto('/')
  await page.clock.pauseAt(new Date('2026-10-23T09:00:00'))
  const timer = timerShadow(page)

  await page.keyboard.press('Space')
  await page.clock.fastForward('01:00')
  await expect(timer.getByRole('timer')).toHaveText('24:00')
  await page.keyboard.press('r')
  await expect(timer.getByRole('timer')).toHaveText('25:00')
  await expect(page).toHaveTitle('Pomodoro Focus')
  await page.keyboard.press('s')
  await expect(timer.locator('.phase')).toHaveText('Short break')

  // Typing an "s" into the task field must not skip.
  await page.getByLabel('New task').fill('')
  await page.getByLabel('New task').press('s')
  await expect(timer.locator('.phase')).toHaveText('Short break')
})

test('works offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect(page.locator('#offline-status')).toHaveText('Available offline.')
  // Wait until the worker controls this page so the reload goes through it.
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(timerShadow(page).getByRole('timer')).toHaveText('25:00')
  await expect(page.getByRole('heading', { name: 'Pomodoro Focus' })).toBeVisible()
  await context.setOffline(false)
})
