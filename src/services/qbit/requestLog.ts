import type { AppLogLevel } from '@/stores/appLogs'

type RequestError = {
  code?: string
  message?: string
  response?: { status?: number }
  config?: { method?: string; url?: string; timeout?: number }
}

/**
 * Turns a failed request into a log entry, or null when it isn't worth one. Only the method and path are mentioned,
 * never request data or the full URL, so nothing sensitive can end up in the log.
 */
export function describeRequestProblem(error: RequestError): { level: AppLogLevel; message: string } | null {
  const request = `${(error.config?.method ?? 'get').toUpperCase()} ${error.config?.url ?? '(unknown)'}`
  const status = error.response?.status

  if (error.code === 'ECONNABORTED' && !error.response) {
    const seconds = error.config?.timeout ? ` after ${Math.round(error.config.timeout / 1000)}s` : ''
    return { level: 'warning', message: `${request} timed out${seconds} (qBittorrent or the connection is not answering)` }
  }
  if (status === 403) return { level: 'info', message: `${request} was refused (403): the session may have expired` }
  if (status && status >= 500) return { level: 'warning', message: `${request} returned ${status}` }
  if (!error.response && error.code === 'ERR_NETWORK') return { level: 'warning', message: `${request} failed: network error (qBittorrent unreachable?)` }
  return null
}

/** Fire and forget: logging must never delay or change how the original request fails */
export function logRequestProblem(error: RequestError) {
  const problem = describeRequestProblem(error)
  if (!problem) return
  void import('@/stores/appLogs').then(({ useAppLogStore }) => {
    try {
      useAppLogStore().add(problem.level, 'network', problem.message)
    } catch {
      // ignore
    }
  })
}
