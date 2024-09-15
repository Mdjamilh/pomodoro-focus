import type { TaskStore } from '../lib/tasks'
import { MAX_TITLE } from '../lib/tasks'
import { define, esc, shadow } from './base'

const styles = `
  form { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  input[type='text'] {
    flex: 1; min-width: 0; font: inherit; color: inherit; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 0.6rem; padding: 0.5rem 0.75rem;
  }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
  li {
    display: grid; grid-template-columns: auto auto 1fr auto auto; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.6rem; border-radius: 0.6rem; border: 1px solid transparent;
  }
  li.active { border-color: var(--accent); background: var(--accent-soft); }
  li.done .title { text-decoration: line-through; color: var(--muted); }
  .title { overflow-wrap: anywhere; }
  .count { font-variant-numeric: tabular-nums; font-size: 0.85rem; }
  .icon { padding: 0.2rem 0.55rem; border-radius: 0.5rem; background: transparent; border-color: transparent; }
  .icon:hover { border-color: var(--border); }
  input[type='radio'], input[type='checkbox'] { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); margin: 0; }
  .empty { padding: 0.5rem 0; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; font-size: 0.85rem; }
  .footer button { padding: 0.3rem 0.75rem; }
`

/**
 * <pf-tasks>: add tasks, choose which one the timer is working on, tick
 * them off. Pomodoro counts come from the history via `countFor`.
 */
export class TaskList extends HTMLElement {
  #root: ShadowRoot
  #store: TaskStore | null = null
  #list: HTMLUListElement
  #footer: HTMLElement
  countFor: (taskId: string) => number = () => 0

  constructor() {
    super()
    this.#root = shadow(
      this,
      styles,
      `
      <h2 id="tasks-heading">Tasks</h2>
      <form>
        <label class="visually-hidden" for="new-task">New task</label>
        <input id="new-task" type="text" placeholder="What are you working on?" maxlength="${MAX_TITLE}" autocomplete="off" />
        <button type="submit">Add</button>
      </form>
      <ul aria-labelledby="tasks-heading"></ul>
      <div class="footer muted"></div>
    `,
    )
    this.#list = this.#root.querySelector('ul')!
    this.#footer = this.#root.querySelector('.footer')!

    const form = this.#root.querySelector('form')!
    const input = this.#root.querySelector<HTMLInputElement>('#new-task')!
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (this.#store?.add(input.value)) input.value = ''
      input.focus()
    })

    this.#root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement
      const id = el.closest<HTMLElement>('li')?.dataset.id
      if (!id || !this.#store) return
      if (el.name === 'active') this.#store.setActive(id)
      if (el.name === 'done') this.#store.toggleDone(id)
    })

    this.#root.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button[data-op]')
      if (!button || !this.#store) return
      const id = button.closest<HTMLElement>('li')?.dataset.id
      if (button.dataset.op === 'remove' && id) this.#store.remove(id)
      if (button.dataset.op === 'clear-done') this.#store.clearDone()
    })
  }

  set store(store: TaskStore) {
    this.#store?.removeEventListener('change', this.#render)
    this.#store = store
    store.addEventListener('change', this.#render)
    this.#render()
  }

  /** Re-render, for example after a pomodoro changed the counts. */
  refresh(): void {
    this.#render()
  }

  #render = (): void => {
    const store = this.#store
    if (!store) return
    // Remember focus so ticking a checkbox does not throw keyboard users back to the top.
    const focused = this.#root.activeElement as HTMLElement | null
    const focusKey = focused?.closest('li') ? `${focused.closest<HTMLElement>('li')!.dataset.id}|${focused.getAttribute('name') ?? focused.dataset.op}` : null

    if (store.tasks.length === 0) {
      this.#list.innerHTML = `<li class="empty muted">No tasks yet. Add one and the timer will count pomodoros for it.</li>`
    } else {
      this.#list.innerHTML = store.tasks
        .map((t) => {
          const count = this.countFor(t.id)
          const active = store.activeId === t.id
          const label = esc(t.title)
          return `
          <li data-id="${esc(t.id)}" class="${active ? 'active' : ''} ${t.done ? 'done' : ''}">
            <input type="radio" name="active" ${active ? 'checked' : ''} ${t.done ? 'disabled' : ''} aria-label="Focus on ${label}" />
            <input type="checkbox" name="done" ${t.done ? 'checked' : ''} aria-label="Mark ${label} as done" />
            <span class="title">${label}</span>
            <span class="count muted" title="Pomodoros finished">${count}${t.estimate ? ` / ${t.estimate}` : ''}</span>
            <button class="icon" data-op="remove" aria-label="Delete ${label}">&times;</button>
          </li>`
        })
        .join('')
    }

    const done = store.tasks.filter((t) => t.done).length
    this.#footer.innerHTML = done
      ? `<span>${done} done</span><button data-op="clear-done">Clear finished</button>`
      : ''

    if (focusKey) {
      const [id, key] = focusKey.split('|')
      const li = this.#list.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"]`)
      const target = li?.querySelector<HTMLElement>(`[name="${key}"], [data-op="${key}"]`)
      target?.focus()
    }
  }
}

define('pf-tasks', TaskList)

declare global {
  interface HTMLElementTagNameMap {
    'pf-tasks': TaskList
  }
}
