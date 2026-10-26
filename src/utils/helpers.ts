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

const NAMED_ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0' }

/**
 * Turns HTML entities that some sources leave in names (e.g. `&quot;` in RSS titles) back into plain characters.
 * Pure string replacement: nothing is parsed as HTML and the result must only ever be shown as text, never via v-html.
 * Decodes a single level, so `&amp;quot;` becomes `&quot;`, not `"`.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (match, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match
    const codePoint = dec ? parseInt(dec, 10) : parseInt(hex, 16)
    const isValid = codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
    return isValid ? String.fromCodePoint(codePoint) : match
  })
}

/**
 * Returns only the entries of `current` whose value differs from `baseline` (compared by value, one level deep).
 * Lets a settings form send what the user actually changed instead of a whole, possibly outdated, copy.
 */
export function getChangedEntries<T extends Record<string, any>>(current: T, baseline: Partial<T>): Partial<T> {
  const changed: Partial<T> = {}
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(baseline[key])) {
      changed[key] = current[key]
    }
  }
  return changed
}
