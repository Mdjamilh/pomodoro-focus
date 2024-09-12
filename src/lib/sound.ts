/**
 * A soft two-note chime made with the Web Audio API, so the app ships no
 * audio files. Each note is a sine wave with a quick attack and a long
 * exponential decay, which sounds like a small bell rather than a beep.
 */

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor: AudioCtor | undefined =
    globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

/**
 * Browsers only let audio start after a user gesture. Call this from the
 * Start button so the context is already running when a phase ends later,
 * possibly in a background tab.
 */
export function unlockAudio(): void {
  const c = getContext()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

export interface ChimeNote {
  frequency: number
  at: number
  length: number
}

/** Rising notes for "break time", falling notes for "back to work". */
export function chimeNotes(kind: 'break' | 'work'): ChimeNote[] {
  const low = 659.25 // E5
  const high = 987.77 // B5
  const [a, b] = kind === 'break' ? [low, high] : [high, low]
  return [
    { frequency: a, at: 0, length: 1.2 },
    { frequency: b, at: 0.28, length: 1.6 },
  ]
}

export function playChime(kind: 'break' | 'work', volume = 0.5): void {
  const c = getContext()
  if (!c || volume <= 0) return
  if (c.state === 'suspended') void c.resume().catch(() => {})

  const master = c.createGain()
  master.gain.value = Math.min(1, Math.max(0, volume)) * 0.35
  master.connect(c.destination)

  const t0 = c.currentTime + 0.02
  for (const note of chimeNotes(kind)) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(note.frequency, t0 + note.at)
    gain.gain.setValueAtTime(0.0001, t0 + note.at)
    gain.gain.exponentialRampToValueAtTime(1, t0 + note.at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.length)
    osc.connect(gain).connect(master)
    osc.start(t0 + note.at)
    osc.stop(t0 + note.at + note.length + 0.05)
  }
}
