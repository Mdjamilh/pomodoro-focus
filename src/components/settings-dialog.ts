import { LIMITS, normalizeSettings, type Settings } from '../lib/settings'
import { notificationPermission, requestNotifications } from '../lib/notify'
import { playChime, unlockAudio } from '../lib/sound'
import { define, emit, shadow } from './base'

const styles = `
  :host { display: contents; }
  dialog {
    color: var(--fg); background: var(--surface); border: 1px solid var(--border);
    border-radius: 1rem; padding: 1.25rem 1.5rem; width: min(26rem, calc(100vw - 2rem));
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  fieldset { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.6rem; }
  legend { font-weight: 600; margin-bottom: 0.5rem; padding: 0; }
  label { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  input[type='number'], select {
    font: inherit; color: inherit; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.5rem; padding: 0.3rem 0.5rem; width: 6rem;
  }
  input[type='checkbox'] { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
  input[type='range'] { accent-color: var(--accent); }
  .row { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .hint { font-size: 0.8rem; margin: -0.25rem 0 0; }
  h2 { font-size: 1.15rem; }
`

/**
 * <pf-settings>: a native <dialog> with the timer lengths, sound,
 * notifications and theme. Emits `settings-change` with the validated values.
 */
export class SettingsDialog extends HTMLElement {
  #root: ShadowRoot
  #dialog: HTMLDialogElement
  #form: HTMLFormElement
  #hint: HTMLElement

  constructor() {
    super()
    const num = (name: keyof typeof LIMITS, label: string) =>
      `<label>${label}<input type="number" name="${name}" min="${LIMITS[name][0]}" max="${LIMITS[name][1]}" step="1" required /></label>`
    this.#root = shadow(
      this,
      styles,
      `
      <dialog aria-labelledby="settings-title">
        <form method="dialog">
          <h2 id="settings-title">Settings</h2>
          <fieldset>
            <legend>Timer (minutes)</legend>
            ${num('workMinutes', 'Focus')}
            ${num('shortBreakMinutes', 'Short break')}
            ${num('longBreakMinutes', 'Long break')}
            ${num('longBreakEvery', 'Long break after (sessions)')}
            <label>Start breaks automatically <input type="checkbox" name="autoStartBreaks" /></label>
            <label>Start focus automatically <input type="checkbox" name="autoStartWork" /></label>
          </fieldset>
          <fieldset>
            <legend>Alerts</legend>
            <label>Chime <input type="checkbox" name="sound" /></label>
            <label>Volume <input type="range" name="volume" min="0" max="1" step="0.05" /></label>
            <label>Desktop notifications <input type="checkbox" name="notifications" /></label>
            <p class="hint muted" aria-live="polite"></p>
          </fieldset>
          <fieldset>
            <legend>Appearance</legend>
            <label>Theme
              <select name="theme">
                <option value="system">Match system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </fieldset>
          <div class="row">
            <button type="button" data-op="test">Test chime</button>
            <button value="cancel" formnovalidate>Cancel</button>
            <button value="save" class="primary">Save</button>
          </div>
        </form>
      </dialog>
    `,
    )
    this.#dialog = this.#root.querySelector('dialog')!
    this.#form = this.#root.querySelector('form')!
    this.#hint = this.#root.querySelector('.hint')!

    this.#dialog.addEventListener('close', () => {
      if (this.#dialog.returnValue === 'save') emit(this, 'settings-change', this.#read())
    })

    this.#root.querySelector('[data-op="test"]')!.addEventListener('click', () => {
      unlockAudio()
      playChime('break', Number(this.#field('volume').value))
    })

    this.#field('notifications').addEventListener('change', async (e) => {
      const box = e.target as HTMLInputElement
      if (!box.checked) return
      const permission = await requestNotifications()
      if (permission !== 'granted') {
        box.checked = false
        this.#hint.textContent =
          permission === 'unsupported' ? 'This browser does not support notifications.' : 'Notifications are blocked for this site in the browser settings.'
      } else {
        this.#hint.textContent = ''
      }
    })
  }

  open(settings: Settings): void {
    for (const [key, value] of Object.entries(settings)) {
      const el = this.#form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null
      if (!el) continue
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value)
      else el.value = String(value)
    }
    // Permission may have been revoked in the browser since the setting was saved.
    if (notificationPermission() !== 'granted') (this.#field('notifications') as HTMLInputElement).checked = false
    this.#hint.textContent = ''
    this.#dialog.returnValue = ''
    this.#dialog.showModal()
  }

  get isOpen(): boolean {
    return this.#dialog.open
  }

  #field(name: string): HTMLInputElement {
    return this.#form.elements.namedItem(name) as HTMLInputElement
  }

  #read(): Settings {
    const data: Record<string, unknown> = {}
    for (const el of Array.from(this.#form.elements) as HTMLInputElement[]) {
      if (!el.name) continue
      if (el.type === 'checkbox') data[el.name] = el.checked
      else if (el.type === 'number' || el.type === 'range') data[el.name] = Number(el.value)
      else data[el.name] = el.value
    }
    return normalizeSettings(data)
  }
}

define('pf-settings', SettingsDialog)

declare global {
  interface HTMLElementTagNameMap {
    'pf-settings': SettingsDialog
  }
}
