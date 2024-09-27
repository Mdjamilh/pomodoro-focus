import { describe, expect, it } from 'vitest'
import { assetsFromHtml, cacheName, staleCaches, strategyFor } from '../src/sw/precache'

const ORIGIN = 'https://focus.example'
const url = (path: string) => new URL(path, ORIGIN)

describe('service worker helpers', () => {
  it('extracts hashed script and stylesheet URLs from built HTML', () => {
    const html = `
      <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <script type="module" crossorigin src="/assets/index-q9kXZS0f.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-C1zULPkE.css">
      <link rel="preconnect" href="https://fonts.example" />
      <script src="//cdn.example/x.js"></script>
      <a href="/not-an-asset">link</a>`
    expect(assetsFromHtml(html)).toEqual([
      '/icons/icon.svg',
      '/manifest.webmanifest',
      '/assets/index-q9kXZS0f.js',
      '/assets/index-C1zULPkE.css',
    ])
  })

  it('deletes only our own caches from older builds', () => {
    const current = cacheName('abc')
    expect(staleCaches(['pomodoro-focus-old', current, 'someone-else'], current)).toEqual(['pomodoro-focus-old'])
  })

  it('uses network first for page loads', () => {
    expect(strategyFor('GET', url('/'), ORIGIN, 'navigate')).toBe('network-first')
    expect(strategyFor('GET', url('/anything?x=1'), ORIGIN, 'navigate')).toBe('network-first')
  })

  it('uses cache first for hashed assets and icons', () => {
    expect(strategyFor('GET', url('/assets/index-abc.js'), ORIGIN, 'no-cors')).toBe('cache-first')
    expect(strategyFor('GET', url('/icons/icon-192.png'), ORIGIN, 'no-cors')).toBe('cache-first')
  })

  it('leaves other requests alone', () => {
    expect(strategyFor('POST', url('/assets/x.js'), ORIGIN, 'cors')).toBe('bypass')
    expect(strategyFor('GET', new URL('https://other.example/a.js'), ORIGIN, 'cors')).toBe('bypass')
    expect(strategyFor('GET', url('/sw.js'), ORIGIN, 'same-origin')).toBe('bypass')
  })
})
