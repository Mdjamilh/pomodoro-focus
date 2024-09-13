import { afterEach, describe, expect, it, vi } from 'vitest'
import { chimeNotes, playChime } from '../src/lib/sound'
import { completionMessage, notificationPermission, showNotification } from '../src/lib/notify'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chime', () => {
  it('rises for a break and falls for work', () => {
    const up = chimeNotes('break')
    const down = chimeNotes('work')
    expect(up[0].frequency).toBeLessThan(up[1].frequency)
    expect(down[0].frequency).toBeGreaterThan(down[1].frequency)
  })

  it('does nothing when Web Audio is missing or the volume is zero', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playChime('break', 0)).not.toThrow()
  })
})

describe('notifications', () => {
  it('describes what happens next', () => {
    expect(completionMessage('work', 'shortBreak', true)).toEqual({ title: 'Focus session done', body: 'Short break has started.' })
    expect(completionMessage('longBreak', 'work', false)).toEqual({ title: 'Long break over', body: 'Ready for focus when you are.' })
  })

  it('reports unsupported when the API is missing', () => {
    vi.stubGlobal('Notification', undefined)
    expect(notificationPermission()).toBe('unsupported')
  })

  it('does not notify without permission', async () => {
    const ctor = vi.fn()
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'denied' }))
    expect(await showNotification('a', 'b')).toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('falls back to the page constructor without a service worker', async () => {
    const ctor = vi.fn()
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }))
    expect(await showNotification('Done', 'Break time')).toBe(true)
    expect(ctor).toHaveBeenCalledWith('Done', expect.objectContaining({ body: 'Break time' }))
  })
})
