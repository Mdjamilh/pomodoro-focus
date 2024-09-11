export type ShortcutAction = 'toggle' | 'reset' | 'skip' | 'help'

export const SHORTCUTS: ReadonlyArray<{ keys: string; action: ShortcutAction; label: string }> = [
  { keys: 'Space', action: 'toggle', label: 'Start or pause' },
  { keys: 'R', action: 'reset', label: 'Reset the current phase' },
  { keys: 'S', action: 'skip', label: 'Skip to the next phase' },
  { keys: '?', action: 'help', label: 'Show shortcuts' },
]

function isEditable(el: EventTarget | undefined): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(type)
  }
  return false
}

/**
 * Maps a keydown to an action, or null when the key should behave normally.
 *
 * The real target comes from composedPath()[0]: inside a shadow root the
 * event is retargeted to the host element, so `event.target` would hide the
 * fact that the user is typing into a text field in a web component.
 */
export function shortcutFor(event: KeyboardEvent): ShortcutAction | null {
  if (event.defaultPrevented || event.repeat) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  const origin = event.composedPath()[0] ?? event.target ?? undefined
  if (isEditable(origin)) return null
  // Space on a focused button already clicks it; don't also toggle the timer.
  if (event.key === ' ' && origin instanceof HTMLElement && (origin.tagName === 'BUTTON' || origin.tagName === 'SUMMARY')) return null
  if (origin instanceof HTMLElement && origin.closest('dialog[open]')) return null

  switch (event.key) {
    case ' ':
      return 'toggle'
    case 'r':
    case 'R':
      return 'reset'
    case 's':
    case 'S':
      return 'skip'
    case '?':
      return 'help'
    default:
      return null
  }
}
