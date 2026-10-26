import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { useAppLogStore } from '../src/stores/appLogs'
import { formatConsoleArguments, installAppLogCapture } from '../src/utils/appLogCapture'

describe('formatConsoleArguments', () => {
  it('joins strings, errors and objects, and survives circular objects', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const text = formatConsoleArguments(['failed:', new Error('nope'), { a: 1 }, circular])

    expect(text).toContain('failed: Error: nope {"a":1}')
    expect(text).toContain('[object Object]')
  })
})

describe('installAppLogCapture', () => {
  const pinia = createPinia()
  const originalError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const originalWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  installAppLogCapture(pinia)
  const store = useAppLogStore(pinia)

  it('records console.error and console.warn, and still prints them', () => {
    console.error('something broke', new Error('details here'))
    console.warn('careful')

    expect(store.logs.map(l => [l.level, l.source, l.message])).toEqual([
      ['error', 'console', 'something broke Error: details here'],
      ['warning', 'console', 'careful'],
    ])
    expect(store.logs[0].details).toContain('Error: details here')
    expect(originalError).toHaveBeenCalled()
    expect(originalWarn).toHaveBeenCalled()
  })

  it('records uncaught errors and unhandled promise rejections', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: x is undefined', filename: 'app.js', lineno: 3, colno: 9 }))
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
    rejection.reason = new Error('request failed')
    window.dispatchEvent(rejection)

    const last = store.logs.slice(-2)
    expect(last[0]).toMatchObject({ level: 'error', source: 'window', message: 'Uncaught TypeError: x is undefined' })
    expect(last[0].details).toContain('app.js:3:9')
    expect(last[1]).toMatchObject({ level: 'error', source: 'promise', message: 'Unhandled rejection: Error: request failed' })
  })

  it('ignores harmless browser noise', () => {
    const before = store.logs.length
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }))

    expect(store.logs).toHaveLength(before)
  })

  it('does not install twice', () => {
    const before = store.logs.length
    installAppLogCapture(pinia)
    console.warn('once')

    expect(store.logs.length - before).toBe(1)
  })
})
