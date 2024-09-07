import { describe, expect, it, vi } from 'vitest'
import { TaskStore } from '../src/lib/tasks'
import { memoryStore } from '../src/lib/storage'

describe('TaskStore', () => {
  it('adds tasks with tidy titles and makes the first one active', () => {
    const tasks = new TaskStore(memoryStore())
    const a = tasks.add('  Write   report  ')
    tasks.add('Review PR')
    expect(a?.title).toBe('Write report')
    expect(tasks.tasks).toHaveLength(2)
    expect(tasks.activeId).toBe(a?.id)
  })

  it('rejects empty titles', () => {
    const tasks = new TaskStore(memoryStore())
    expect(tasks.add('   ')).toBeNull()
    expect(tasks.tasks).toHaveLength(0)
  })

  it('finishing the active task clears the active selection', () => {
    const tasks = new TaskStore(memoryStore())
    const a = tasks.add('A')!
    tasks.toggleDone(a.id)
    expect(tasks.tasks[0].done).toBe(true)
    expect(tasks.activeId).toBeNull()
  })

  it('cannot make a finished task active', () => {
    const tasks = new TaskStore(memoryStore())
    const a = tasks.add('A')!
    tasks.toggleDone(a.id)
    tasks.setActive(a.id)
    expect(tasks.activeId).toBeNull()
  })

  it('removing the active task clears the selection', () => {
    const tasks = new TaskStore(memoryStore())
    const a = tasks.add('A')!
    tasks.remove(a.id)
    expect(tasks.active).toBeNull()
  })

  it('persists between instances and emits change events', () => {
    const store = memoryStore()
    const first = new TaskStore(store)
    const onChange = vi.fn()
    first.addEventListener('change', onChange)
    const a = first.add('Persist me')!
    first.rename(a.id, 'Renamed')
    expect(onChange).toHaveBeenCalledTimes(2)
    const second = new TaskStore(store)
    expect(second.tasks.map((t) => t.title)).toEqual(['Renamed'])
    expect(second.activeId).toBe(a.id)
  })

  it('clears finished tasks', () => {
    const tasks = new TaskStore(memoryStore())
    const a = tasks.add('A')!
    tasks.add('B')
    tasks.toggleDone(a.id)
    tasks.clearDone()
    expect(tasks.tasks.map((t) => t.title)).toEqual(['B'])
  })

  it('drops malformed entries from storage', () => {
    const store = memoryStore()
    store.setItem('pomodoro-focus:tasks', JSON.stringify({ tasks: [{ id: 'x', title: 'ok' }, { nope: 1 }], activeId: 'gone' }))
    const tasks = new TaskStore(store)
    expect(tasks.tasks).toHaveLength(1)
    expect(tasks.activeId).toBeNull()
  })
})
