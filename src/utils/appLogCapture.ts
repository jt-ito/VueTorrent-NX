import type { Pinia } from 'pinia'
import { type AppLogLevel, useAppLogStore } from '@/stores/appLogs'

/** Browser noise that is harmless and would only bury the useful entries */
const IGNORED_MESSAGES = [/ResizeObserver loop/i]

let isInstalled = false

function describe(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    const config = (value as { config?: { method?: string; url?: string } }).config
    const request = config?.url ? ` (${(config.method ?? 'get').toUpperCase()} ${config.url})` : ''
    return `${value.name}: ${value.message}${request}`
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function formatConsoleArguments(args: unknown[]): string {
  return args.map(describe).join(' ')
}

function stackOf(values: unknown[]): string | undefined {
  const error = values.find((v): v is Error => v instanceof Error)
  return error?.stack
}

/**
 * Records uncaught errors, unhandled promise rejections and console.error / console.warn calls in the VueTorrent log.
 * Recording never throws and never records itself, so a problem in here can't make things worse.
 */
export function installAppLogCapture(pinia: Pinia) {
  if (isInstalled) return
  isInstalled = true

  let isRecording = false
  function record(level: AppLogLevel, source: string, message: string, details?: string) {
    if (isRecording || IGNORED_MESSAGES.some(pattern => pattern.test(message))) return
    isRecording = true
    try {
      useAppLogStore(pinia).add(level, source, message, details)
    } catch {
      // never let logging break the app
    } finally {
      isRecording = false
    }
  }

  for (const [method, level] of [
    ['error', 'error'],
    ['warn', 'warning'],
  ] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args)
      record(level, 'console', formatConsoleArguments(args), stackOf(args))
    }
  }

  window.addEventListener('error', event => {
    const where = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
    record('error', 'window', event.message || 'Script error', [where, event.error?.stack].filter(Boolean).join('\n') || undefined)
  })

  window.addEventListener('unhandledrejection', event => {
    record('error', 'promise', `Unhandled rejection: ${describe(event.reason)}`, stackOf([event.reason]))
  })
}

/** Writes an entry from code that isn't a store; safe to call before the app is ready (it is then skipped) */
export function writeAppLog(pinia: Pinia | undefined, level: AppLogLevel, source: string, message: string, details?: string) {
  try {
    if (pinia) useAppLogStore(pinia).add(level, source, message, details)
  } catch {
    // ignore
  }
}
