export function normalizeExtension(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase().replace(/^[\*\.]+/, '')
  if (!normalized) return null
  return '.' + normalized
}

export function extensionToGlob(ext: string): string {
  if (ext.startsWith('.')) return '*' + ext
  return '*.' + ext
}

export function globToExtension(glob: string): string | null {
  if (glob.startsWith('*.')) return glob.substring(1)
  return null
}

export function reconcileNativeExcludedFiles(
  currentNativeGlobsStr: string | null | undefined,
  lastPushedNativeGlobs: string[],
  newExtensions: string[]
): { finalGlobsStr: string; newPushedGlobs: string[] } {
  const currentNativeGlobs = (currentNativeGlobsStr || '')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s)

  const withoutOldPushed = currentNativeGlobs.filter(
    glob => !lastPushedNativeGlobs.includes(glob)
  )

  const newGlobsToPush = newExtensions.map(extensionToGlob)

  const finalGlobs = Array.from(new Set([...withoutOldPushed, ...newGlobsToPush]))

  return {
    finalGlobsStr: finalGlobs.join('\n'),
    newPushedGlobs: newGlobsToPush
  }
}

export function extractMagnetHash(uri: string): string | null {
  const match = uri.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Runs `task` for every item with at most `limit` running at once (a failing task doesn't stop the others).
 * Used to avoid flooding the server with one request chain per torrent.
 */
export async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      try {
        await task(item)
      } catch {
        // one failing item must not stall the queue
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
