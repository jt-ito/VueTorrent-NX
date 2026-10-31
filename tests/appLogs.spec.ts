import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { MAX_APP_LOGS, useAppLogStore } from '../src/stores/appLogs'

describe('app log store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds entries with increasing ids, newest last', () => {
    const store = useAppLogStore()
    store.add('info', 'app', 'one')
    store.add('error', 'app', 'two')

    expect(store.logs.map(l => [l.id, l.message, l.level])).toEqual([
      [0, 'one', 'info'],
      [1, 'two', 'error'],
    ])
  })

  it('counts the same entry repeating right after itself instead of listing it again', () => {
    const store = useAppLogStore()
    store.add('warning', 'network', 'GET /x timed out')
    store.add('warning', 'network', 'GET /x timed out')
    store.add('warning', 'network', 'GET /x timed out')
    store.add('warning', 'network', 'something else')
    store.add('warning', 'network', 'GET /x timed out')

    expect(store.logs.map(l => [l.message, l.count])).toEqual([
      ['GET /x timed out', 3],
      ['something else', 1],
      ['GET /x timed out', 1],
    ])
  })

  it('keeps at most MAX_APP_LOGS entries and drops the oldest', () => {
    const store = useAppLogStore()
    for (let i = 0; i < MAX_APP_LOGS + 25; i++) store.add('info', 'app', `entry ${i}`)

    expect(store.logs).toHaveLength(MAX_APP_LOGS)
    expect(store.logs[0].message).toBe('entry 25')
    expect(store.logs.at(-1)!.message).toBe(`entry ${MAX_APP_LOGS + 24}`)
  })

  it('clips very long messages and details', () => {
    const store = useAppLogStore()
    store.add('error', 'console', 'x'.repeat(5000), 'y'.repeat(9000))

    expect(store.logs[0].message.length).toBeLessThanOrEqual(501)
    expect(store.logs[0].details!.length).toBeLessThanOrEqual(2001)
  })

  it('clears everything', () => {
    const store = useAppLogStore()
    store.add('info', 'app', 'one')
    store.clear()

    expect(store.logs).toEqual([])
  })

  it('filters by level and by text', async () => {
    const store = useAppLogStore()
    store.add('info', 'app', 'started')
    store.add('warning', 'network', 'slow response')
    store.add('error', 'console', 'boom')

    store.levelFilter = ['error', 'warning']
    await nextTick()
    expect(store.filteredLogs.map(l => l.message).sort()).toEqual(['boom', 'slow response'])

    store.messageFilter = 'boom'
    await nextTick()
    expect(store.filteredLogs.map(l => l.message)).toEqual(['boom'])
  })

  it('produces readable text, oldest first, with counts and details', () => {
    const store = useAppLogStore()
    store.add('info', 'app', 'started')
    store.add('error', 'console', 'boom', 'at line 1\nat line 2')
    store.add('error', 'console', 'boom')

    const lines = store.toText().split('\n')
    expect(lines[0]).toMatch(/\[INFO\] \[app\] started$/)
    expect(lines[1]).toMatch(/\[ERROR\] \[console\] boom \(x2\)$/)
    expect(lines.slice(2)).toEqual(['    at line 1', '    at line 2'])
  })

  it('keeps numbering on after a reload instead of starting again from 0', () => {
    const store = useAppLogStore()
    // what the saved logs look like when the page loads again
    store.logs = [
      { id: 0, timestamp: 100, level: 'info', source: 'app', message: 'started', count: 1 },
      { id: 1, timestamp: 110, level: 'info', source: 'network', message: 'refused', count: 1 },
      { id: 2, timestamp: 120, level: 'info', source: 'settings', message: 'saved', count: 1 },
    ]

    store.add('info', 'app', 'started again')

    expect(store.logs.map(l => l.id)).toEqual([0, 1, 2, 3])
  })

  it('repairs logs saved by the old version, whose ids restarted on every load', () => {
    const store = useAppLogStore()
    // each load restarted at 0, so the same ids appear several times and file order no longer follows time
    store.logs = [
      { id: 0, timestamp: 100, level: 'info', source: 'app', message: 'started', count: 1 },
      { id: 1, timestamp: 101, level: 'info', source: 'network', message: 'refused', count: 1 },
      { id: 2, timestamp: 150, level: 'info', source: 'exclusions', message: 'deselected', count: 1 },
      { id: 0, timestamp: 200, level: 'info', source: 'app', message: 'started', count: 1 },
      { id: 1, timestamp: 201, level: 'info', source: 'network', message: 'refused', count: 1 },
    ]

    store.add('warning', 'network', 'timed out')

    expect(new Set(store.logs.map(l => l.id)).size).toBe(store.logs.length)
    expect(store.logs.map(l => l.timestamp)).toEqual([...store.logs.map(l => l.timestamp)].sort((a, b) => a - b))
    expect(store.logs.at(-1)).toMatchObject({ message: 'timed out' })
    expect(store.toText().split('\n')[0]).toContain('[app] started')
  })
})
