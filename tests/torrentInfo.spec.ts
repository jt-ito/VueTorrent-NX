// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { describeAddError } from '../src/utils/addTorrentError'
import { base32ToHex, findInfoDictionary, getTorrentFileInfoHash, normalizeInfoHash, splitKnownTorrents } from '../src/utils/torrentInfo'

const text = (value: string) => new TextEncoder().encode(value)
const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => Array.from(p)))
const str = (value: string) => join(text(`${value.length}:`), text(value))

/** A small but realistic .torrent: announce, a list of lists, an integer, then the info dictionary */
function makeTorrent(name: string) {
  const pieces = Uint8Array.from({ length: 20 }, (_, i) => (i * 7 + name.length) % 256)
  const info = join(text('d6:lengthi5e4:name'), str(name), text('12:piece lengthi16384e6:pieces20:'), pieces, text('e'))
  const file = join(text('d8:announce'), str('http://tracker.example/announce'), text('13:announce-listll'), str('http://a'), text('ee13:creation datei1700000000e4:info'), info, text('e'))
  return { file: new File([file], `${name}.torrent`), infoHash: createHash('sha1').update(info).digest('hex'), info }
}

function hexToBase32(hex: string) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const bits = hex
    .split('')
    .map(c => parseInt(c, 16).toString(2).padStart(4, '0'))
    .join('')
  return bits
    .match(/.{1,5}/g)!
    .map(chunk => alphabet[parseInt(chunk.padEnd(5, '0'), 2)])
    .join('')
}

describe('info hashes', () => {
  const hash = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a'

  it('reads hex and base32 hashes the same way', () => {
    expect(base32ToHex(hexToBase32(hash))).toBe(hash)
    expect(normalizeInfoHash(hash.toUpperCase())).toBe(hash)
    expect(normalizeInfoHash(hexToBase32(hash).toUpperCase())).toBe(hash)
    expect(normalizeInfoHash('not a hash')).toBeNull()
    expect(normalizeInfoHash(undefined)).toBeNull()
  })

  it('finds the info dictionary even after lists and integers, and matches an independent SHA-1', async () => {
    const torrent = makeTorrent('Some Show S01E01')

    expect(Array.from(findInfoDictionary(new Uint8Array(await torrent.file.arrayBuffer()))!)).toEqual(Array.from(torrent.info))
    expect(await getTorrentFileInfoHash(torrent.file)).toBe(torrent.infoHash)
  })

  it('gives up quietly on files that are not torrents', async () => {
    expect(await getTorrentFileInfoHash(new Blob(['hello world']))).toBeNull()
    expect(await getTorrentFileInfoHash(new Blob([text('d4:name5:abc')]))).toBeNull()
    expect(await getTorrentFileInfoHash(new Blob([]))).toBeNull()
  })
})

describe('splitKnownTorrents', () => {
  const existing = makeTorrent('Already Here')
  const fresh = makeTorrent('Brand New')
  const known = [
    { hash: existing.infoHash, name: 'Already Here S01E01 1080p' },
    { hash: 'ffffffffffffffffffffffffffffffffffffffff', infohash_v1: '1111111111111111111111111111111111111111', name: 'Other' },
  ]

  it('recognises a .torrent file qBittorrent already has, and keeps a new one', async () => {
    const result = await splitKnownTorrents([existing.file, fresh.file], '', known)

    expect(result.alreadyAdded).toEqual([{ source: 'Already Here.torrent', name: 'Already Here S01E01 1080p' }])
    expect(result.files).toEqual([fresh.file])
  })

  it('recognises magnet links (hex or base32), and keeps new ones and plain links', async () => {
    const urls = [
      `magnet:?xt=urn:btih:${existing.infoHash.toUpperCase()}&dn=x`,
      `magnet:?xt=urn:btih:${hexToBase32('1111111111111111111111111111111111111111')}&tr=http://t`,
      `magnet:?xt=urn:btih:${'2'.repeat(40)}`,
      'https://example.org/some.torrent',
    ].join('\n')

    const result = await splitKnownTorrents([], urls, known)

    expect(result.alreadyAdded.map(a => a.name)).toEqual(['Already Here S01E01 1080p', 'Other'])
    expect(result.urls.split('\n')).toEqual([`magnet:?xt=urn:btih:${'2'.repeat(40)}`, 'https://example.org/some.torrent'])
  })

  it('treats everything as new when nothing matches', async () => {
    const result = await splitKnownTorrents([fresh.file], 'magnet:?xt=urn:btih:' + '3'.repeat(40), known)

    expect(result.alreadyAdded).toEqual([])
    expect(result.files).toHaveLength(1)
    expect(result.urls).toBe('magnet:?xt=urn:btih:' + '3'.repeat(40))
  })
})

describe('describeAddError', () => {
  it('explains the common failures', () => {
    expect(describeAddError({ response: { status: 409 } }).key).toBe('toast.add.error_refused')
    expect(describeAddError({ response: { status: 415 } }).key).toBe('toast.add.error_invalid_file')
    expect(describeAddError({ response: { status: 403 } }).key).toBe('toast.add.error_session')
    expect(describeAddError({ code: 'ECONNABORTED' }).key).toBe('toast.add.error_unreachable')
    expect(describeAddError({ code: 'ERR_NETWORK' }).key).toBe('toast.add.error_unreachable')
    expect(describeAddError({ response: { status: 502 } })).toEqual({ key: 'toast.add.error_server', params: { status: 502 } })
    expect(describeAddError({ response: { status: 400 } })).toEqual({ key: 'toast.add.error_http', params: { status: 400 } })
  })

  it('falls back to the general message', () => {
    expect(describeAddError(new Error('something odd')).key).toBe('toast.add.error')
    expect(describeAddError(undefined).key).toBe('toast.add.error')
  })
})
