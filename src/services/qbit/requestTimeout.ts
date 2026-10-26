import type { AxiosInstance } from 'axios'

/** How long a read request may wait before it is abandoned and the next poll can run */
export const DEFAULT_GET_TIMEOUT_MS = 20_000

/**
 * Gives every plain GET request a timeout. Without one, a single request that never completes (qBittorrent busy moving
 * files, a stalled proxy or connection) blocks its poller forever, because pollers skip a round while one is running.
 * Downloads (blobs) and writes are left alone: they can legitimately take longer.
 */
export function addDefaultGetTimeout(instance: AxiosInstance, timeoutMs: number = DEFAULT_GET_TIMEOUT_MS) {
  instance.interceptors.request.use(config => {
    const isGet = (config.method ?? 'get').toLowerCase() === 'get'
    if (isGet && !config.timeout && config.responseType !== 'blob') {
      config.timeout = timeoutMs
    }
    return config
  })
}
