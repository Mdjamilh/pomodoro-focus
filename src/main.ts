import './style.css'
import './components/timer-display'
import './components/task-list'
import './components/history-panel'
import './components/settings-dialog'
import type { TimerAction } from './components/timer-display'
import { TimerController, type CompletionDetail, type TimerSnapshot } from './timer/controller'
import { defaultStore } from './lib/storage'
import { loadSettings, saveSettings, type Settings, type Theme } from './lib/settings'
import { TaskStore } from './lib/tasks'
import { HistoryStore } from './lib/history'
import { announce, announcement } from './lib/announcer'
import { documentTitle } from './lib/format'
import { SHORTCUTS, shortcutFor } from './lib/shortcuts'
import { playChime, unlockAudio } from './lib/sound'
import { completionMessage, showNotification } from './lib/notify'
import { registerServiceWorker } from './lib/pwa'

const store = defaultStore()
let settings = loadSettings(store)

const tasks = new TaskStore(store)
const history = new HistoryStore(store)
const timer = new TimerController(settings, { store, doc: document })

const timerEl = document.querySelector('pf-timer')!
const tasksEl = document.querySelector('pf-tasks')!
const historyEl = document.querySelector('pf-history')!
const settingsEl = document.querySelector('pf-settings')!
const helpDialog = document.querySelector<HTMLDialogElement>('#help')!
const liveRegion = document.querySelector<HTMLElement>('#announcer')!

function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}
applyTheme(settings.theme)

// --- rendering -------------------------------------------------------------

let previous: TimerSnapshot | null = null

function render(snap: TimerSnapshot): void {
  timerEl.update(snap, tasks.active?.title ?? null)
  document.body.dataset.phase = snap.phase
  document.title = documentTitle(snap.remainingMs, snap.phase, snap.status)
  const message = announcement(previous, snap)
  if (message) announce(liveRegion, message)
  previous = snap
}

timer.addEventListener('change', (e) => render((e as CustomEvent<TimerSnapshot>).detail))

timer.addEventListener('complete', (e) => {
  const done = (e as CustomEvent<CompletionDetail>).detail
  if (done.phase === 'work') {
    const task = tasks.active
    history.add({
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      startedAt: done.startedAt,
      endedAt: done.endedAt,
      durationMs: done.durationMs,
    })
    tasksEl.refresh()
  }
  // Phases that ended while the app was closed are recorded, but we don't
  // ring a bell for something that happened an hour ago.
  if (done.late) return
  if (settings.sound) playChime(done.phase === 'work' ? 'break' : 'work', settings.volume)
  if (settings.notifications && document.visibilityState === 'hidden') {
    const { title, body } = completionMessage(done.phase, done.next.phase, done.next.status === 'running')
    void showNotification(title, body)
  }
})

// --- wiring ----------------------------------------------------------------

tasksEl.countFor = (id) => history.countForTask(id)
tasksEl.store = tasks
historyEl.history = history
tasks.addEventListener('change', () => render(timer.snapshot()))

function act(action: TimerAction): void {
  if (action === 'toggle') {
    // Starting is a user gesture, the one moment we're allowed to wake audio.
    unlockAudio()
    timer.toggle()
  } else if (action === 'reset') timer.reset()
  else timer.skip()
}

timerEl.addEventListener('timer-action', (e) => act((e as CustomEvent<TimerAction>).detail))

document.addEventListener('keydown', (e) => {
  const action = shortcutFor(e)
  if (!action) return
  e.preventDefault()
  if (action === 'help') helpDialog.showModal()
  else act(action)
})

document.querySelector('#open-settings')!.addEventListener('click', () => settingsEl.open(settings))
document.querySelector('#open-help')!.addEventListener('click', () => helpDialog.showModal())

document.querySelector('#shortcut-list')!.innerHTML = SHORTCUTS.map(
  (s) => `<dt><kbd>${s.keys}</kbd></dt><dd>${s.label}</dd>`,
).join('')

settingsEl.addEventListener('settings-change', (e) => {
  settings = saveSettings(store, (e as CustomEvent<Settings>).detail)
  applyTheme(settings.theme)
  timer.setConfig(settings)
})

// Another tab changed something. localStorage fires `storage` only in the
// other tabs, which is exactly where we need to pick the change up.
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key.endsWith(':timer')) timer.reload()
  if (e.key === null || e.key.endsWith(':tasks')) tasks.reload()
  if (e.key === null || e.key.endsWith(':history')) history.reload()
  if (e.key === null || e.key.endsWith(':settings')) {
    settings = loadSettings(store)
    applyTheme(settings.theme)
    timer.setConfig(settings)
  }
})

// Coming back from bfcache or regaining focus: recompute from the clock.
window.addEventListener('pageshow', () => timer.sync())
window.addEventListener('focus', () => timer.sync())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') historyEl.refresh()
})

timer.sync()
registerServiceWorker(document.querySelector('#offline-status'))
