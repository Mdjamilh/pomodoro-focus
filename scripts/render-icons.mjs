// Renders public/icons/icon.svg to the PNG sizes the web app manifest needs.
// Run from the repo root: node scripts/render-icons.mjs
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const svg = await readFile('public/icons/icon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()

async function render(size, file, padding = 0) {
  await page.setViewportSize({ width: size, height: size })
  const inner = size - padding * 2
  // Maskable icons need a full-bleed background with the artwork inside the safe zone.
  await page.setContent(
    `<body style="margin:0;background:${padding ? "#c2410c" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg', `<svg width="${inner}" height="${inner}"`)}</div></body>`,
  )
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: padding === 0 })
}

await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
await render(512, 'maskable-512.png', 56)
await browser.close()
console.log('icons written')
