export type UnresponsiveNoticeOptions = {
  /** Called when qBittorrent should be shown as not answering. `isFirst` is false for repeats within the same outage. */
  onUnresponsive: (isFirst: boolean) => void
  /** Called once when it answers again; `downMs` is how long the outage lasted */
  onRecovered: (downMs: number) => void
  /** A request still waiting after this long counts as "not answering", without waiting for it to time out */
  slowAfterMs?: number
  now?: () => number
}

/**
 * Tracks whether qBittorrent is answering, from the outcome of each poll, so the UI can say so instead of just
 * looking frozen. It only decides *when* to notify; showing anything is up to the callbacks.
 */
export function createUnresponsiveNotice({ onUnresponsive, onRecovered, slowAfterMs = 8000, now = Date.now }: UnresponsiveNoticeOptions) {
  let downSince: number | null = null

  function markDown() {
    const isFirst = downSince === null
    if (isFirst) downSince = now()
    onUnresponsive(isFirst)
  }

  function markUp() {
    if (downSince === null) return
    const downMs = now() - downSince
    downSince = null
    onRecovered(downMs)
  }

  /** Call when a request starts. Then call exactly one of succeed / fail / cancel when it ends. */
  function begin() {
    const timer = setTimeout(markDown, slowAfterMs)
    return {
      succeed() {
        clearTimeout(timer)
        markUp()
      },
      fail() {
        clearTimeout(timer)
        markDown()
      },
      /** The request ended for a reason that says nothing about qBittorrent answering (e.g. the login expired) */
      cancel() {
        clearTimeout(timer)
      },
    }
  }

  return { begin, isDown: () => downSince !== null }
}
