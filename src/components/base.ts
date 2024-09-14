/** Escapes text for safe use inside HTML templates. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Styles shared by every component. Custom properties such as --fg and
 * --accent are inherited through the shadow boundary, so the light and dark
 * themes defined on :root reach inside each component automatically.
 */
export const baseStyles = `
  :host { display: block; color: var(--fg); font: inherit; }
  :host([hidden]) { display: none; }
  * { box-sizing: border-box; }
  button {
    font: inherit;
    color: inherit;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: background-color var(--speed) ease, border-color var(--speed) ease;
  }
  button:hover { border-color: var(--accent); }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .visually-hidden {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  h2 { font-size: 1rem; margin: 0 0 0.75rem; letter-spacing: 0.02em; }
  .muted { color: var(--muted); }
`

/** Creates an open shadow root with the base styles plus component styles. */
export function shadow(host: HTMLElement, styles: string, html: string): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${baseStyles}${styles}</style>${html}`
  return root
}

export function emit<T>(el: HTMLElement, type: string, detail: T): void {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
}

export function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor)
}
