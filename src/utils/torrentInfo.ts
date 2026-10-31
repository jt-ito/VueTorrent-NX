import { extractMagnetHash } from './helpers'

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const MAX_TORRENT_FILE_BYTES = 20 * 1024 * 1024

/** A 32-character base32 info hash (the older magnet style) as the usual 40-character hex */
export function base32ToHex(value: string): string | null {
  let bits = ''
  for (const char of value.toLowerCase()) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) return null
    bits += index.toString(2).padStart(5, '0')
  }
  let hex = ''
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

/** Lowercase 40-character hex for a hex or base32 info hash, or null when it is neither */
export function normalizeInfoHash(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (/^[0-9a-f]{40}$/i.test(value)) return value.toLowerCase()
  return value.length === 32 ? base32ToHex(value) : null
}

/** Position just after the bencoded value that starts at `pos` */
function skipBencode(bytes: Uint8Array, pos: number): number {
  const kind = bytes[pos]
  if (kind === undefined) throw new Error('unexpected end')
  if (kind === 0x69) {
    // i<number>e
    const end = bytes.indexOf(0x65, pos)
    if (end === -1) throw new Error('unterminated integer')
    return end + 1
  }
  if (kind === 0x6c || kind === 0x64) {
    // l...e and d...e
    let next = pos + 1
    while (bytes[next] !== 0x65) {
      if (next >= bytes.length) throw new Error('unterminated list')
      next = skipBencode(bytes, next)
    }
    return next + 1
  }
  if (kind >= 0x30 && kind <= 0x39) {
    // <length>:<bytes>
    let next = pos
    let length = 0
    while (bytes[next] !== 0x3a) {
      if (bytes[next] === undefined) throw new Error('unterminated string length')
      length = length * 10 + (bytes[next] - 0x30)
      next++
    }
    return next + 1 + length
  }
  throw new Error('not bencode')
}

/** The raw bytes of the top-level "info" dictionary of a .torrent file, which is what the info hash is made from */
export function findInfoDictionary(bytes: Uint8Array): Uint8Array | null {
  try {
    if (bytes[0] !== 0x64) return null
    let pos = 1
    while (pos < bytes.length && bytes[pos] !== 0x65) {
      let cursor = pos
      let keyLength = 0
      while (bytes[cursor] !== 0x3a) {
        if (bytes[cursor] === undefined) return null
        keyLength = keyLength * 10 + (bytes[cursor] - 0x30)
        cursor++
      }
      const keyStart = cursor + 1
      const key = new TextDecoder().decode(bytes.subarray(keyStart, keyStart + keyLength))
      const valueStart = keyStart + keyLength
      const valueEnd = skipBencode(bytes, valueStart)
      if (key === 'info') return bytes.subarray(valueStart, valueEnd)
      pos = valueEnd
    }
  } catch {
    // not a torrent file we understand
  }
  return null
}

/** SHA-1 info hash of a .torrent file; null if it can't be worked out (unreadable file, or no crypto on plain http) */
export async function getTorrentFileInfoHash(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle || file.size > MAX_TORRENT_FILE_BYTES) return null
  const info = findInfoDictionary(new Uint8Array(await file.arrayBuffer()))
  if (!info) return null
  const digest = await globalThis.crypto.subtle.digest('SHA-1', new Uint8Array(info))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export type KnownTorrent = { hash: string; infohash_v1?: string; name: string }

/**
 * Splits what the user is about to add into what qBittorrent already has and what is new, by info hash.
 * Magnet links and .torrent files are recognised; plain links to a .torrent file can't be, and are always kept as new.
 */
export async function splitKnownTorrents(files: File[], urlsText: string, known: KnownTorrent[]) {
  const nameByHash = new Map<string, string>()
  for (const torrent of known) {
    for (const hash of [torrent.hash, torrent.infohash_v1]) {
      const normalized = normalizeInfoHash(hash)
      if (normalized) nameByHash.set(normalized, torrent.name)
    }
  }

  const alreadyAdded: { source: string; name: string }[] = []

  const newFiles: File[] = []
  for (const file of files) {
    const hash = await getTorrentFileInfoHash(file)
    const name = hash ? nameByHash.get(hash) : undefined
    if (name) alreadyAdded.push({ source: file.name, name })
    else newFiles.push(file)
  }

  const newUrls: string[] = []
  for (const line of urlsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)) {
    const hash = normalizeInfoHash(extractMagnetHash(line))
    const name = hash ? nameByHash.get(hash) : undefined
    if (name) alreadyAdded.push({ source: line, name })
    else newUrls.push(line)
  }

  return { alreadyAdded, files: newFiles, urls: newUrls.join('\n') }
}
