// Quick manual check: open a URL, collect console errors, take a screenshot.
// Usage: node scripts/smoke.mjs <url> <screenshot.png> [dark]
import { chromium } from '@playwright/test'

const [url = 'http://localhost:47270', out = 'smoke.png', scheme = 'light'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker?.getRegistration()
  return reg ? (reg.active ?? reg.installing ?? reg.waiting)?.scriptURL ?? 'registered' : 'none'
})
await page.screenshot({ path: out, fullPage: true })
console.log(JSON.stringify({ title: await page.title(), serviceWorker: sw, errors }, null, 2))
await browser.close()
