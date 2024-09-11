import { afterEach, describe, expect, it } from 'vitest'
import { shortcutFor } from '../src/lib/shortcuts'

/** Read the action while the event is still being dispatched, like main.ts does. */
function actionFor(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  let action: ReturnType<typeof shortcutFor> = null
  const listener = (e: Event) => {
    action = shortcutFor(e as KeyboardEvent)
  }
  document.addEventListener('keydown', listener)
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }))
  document.removeEventListener('keydown', listener)
  return action
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('keyboard shortcuts', () => {
  it('maps Space, R and S', () => {
    expect(actionFor(document.body, ' ')).toBe('toggle')
    expect(actionFor(document.body, 'r')).toBe('reset')
    expect(actionFor(document.body, 'S')).toBe('skip')
    expect(actionFor(document.body, '?')).toBe('help')
    expect(actionFor(document.body, 'x')).toBeNull()
  })

  it('ignores keys with modifiers so browser shortcuts keep working', () => {
    expect(actionFor(document.body, 'r', { ctrlKey: true })).toBeNull()
    expect(actionFor(document.body, 's', { metaKey: true })).toBeNull()
  })

  it('ignores auto-repeat', () => {
    expect(actionFor(document.body, ' ', { repeat: true })).toBeNull()
  })

  it('does not fire while typing in a text field', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(actionFor(input, 's')).toBeNull()
  })

  it('does not fire while typing in a field inside a shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    root.append(input)
    expect(actionFor(input, 'r')).toBeNull()
  })

  it('leaves Space alone on a focused button', () => {
    const button = document.createElement('button')
    document.body.append(button)
    expect(actionFor(button, ' ')).toBeNull()
    expect(actionFor(button, 'r')).toBe('reset')
  })

  it('still works from a checkbox', () => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    document.body.append(box)
    expect(actionFor(box, 's')).toBe('skip')
  })

})
