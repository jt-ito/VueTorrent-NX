import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePriority } from '@/constants/qbit'
import qbit from '@/services/qbit'
import { useAddTorrentStore } from '@/stores/addTorrents'

vi.mock('@/services/qbit', () => ({
  default: {
    getTorrents: vi.fn(),
    deleteTorrents: vi.fn(),
    getTorrentFiles: vi.fn(),
    setTorrentFilePriority: vi.fn(),
  },
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ isFeatureAvailable: vi.fn().mockReturnValue(true) }) }))
vi.mock('@/stores/preferences', () => ({ usePreferenceStore: () => ({ preferences: {} }) }))
vi.mock('@/stores/dialog', () => ({ useDialogStore: () => ({ createDialog: vi.fn() }) }))
vi.mock('@/components/Dialogs/SingleFileSkippedDialog.vue', () => ({ default: {} }))

const vueTorrentStore = { blockedExtensions: ['.nfo'], allBlockedExtensions: ['.nfo', '.txt'], skipPickerForSingleFile: true }
vi.mock('@/stores/vuetorrent', () => ({ useVueTorrentStore: () => vueTorrentStore }))

// What qBittorrent has told the app so far: torrents, and whether each already has its metadata
const torrentList = new Map<string, { hasMetadata: boolean }>()
vi.mock('@/stores/torrents', () => ({ useTorrentStore: () => ({ getTorrentByHash: (hash: string) => torrentList.get(hash) }) }))

const file = (index: number, name: string) => ({ index, name, size: 100, progress: 0, priority: 1, is_seed: false, piece_range: [0, 1], availability: 1 })
const releaseFiles = [file(0, 'Show S01E01.mkv'), file(1, 'Show S01E01.nfo'), file(2, 'sample/readme.txt')]

describe('processing a torrent added by something else (or by us, without waiting for it)', () => {
  beforeEach(async () => {
    // Load the mocked torrent list once up front: when several first-time dynamic imports of a mocked module run at the
    // same moment, only the first of them gets the mock (a test-setup quirk, not how the app behaves)
    await import('@/stores/torrents')
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    torrentList.clear()
    vi.mocked(qbit.getTorrentFiles).mockResolvedValue(releaseFiles as never)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies the exclusions as soon as the metadata is in, making no requests while it waits', async () => {
    const store = useAddTorrentStore()
    torrentList.set('abc', { hasMetadata: false })

    const done = store.processExternalTorrentBlocklist('abc')
    await vi.advanceTimersByTimeAsync(120_000) // two minutes of a magnet that can't find peers

    expect(qbit.getTorrents).not.toHaveBeenCalled()
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()
    expect(qbit.setTorrentFilePriority).not.toHaveBeenCalled()

    torrentList.set('abc', { hasMetadata: true }) // the metadata finally arrives
    await vi.advanceTimersByTimeAsync(1_500)

    expect(await done).toBe(true)
    expect(qbit.setTorrentFilePriority).toHaveBeenCalledWith('abc', [1, 2], FilePriority.DO_NOT_DOWNLOAD)
  })

  it('handles a torrent that already has its metadata straight away', async () => {
    const store = useAddTorrentStore()
    torrentList.set('abc', { hasMetadata: true })

    const done = store.processExternalTorrentBlocklist('abc')
    await vi.advanceTimersByTimeAsync(10)

    expect(await done).toBe(true)
    expect(qbit.setTorrentFilePriority).toHaveBeenCalledTimes(1)
  })

  it('gives up quietly if the torrent is removed while waiting', async () => {
    const store = useAddTorrentStore()
    torrentList.set('abc', { hasMetadata: false })

    const done = store.processExternalTorrentBlocklist('abc')
    await vi.advanceTimersByTimeAsync(5_000)
    torrentList.delete('abc')
    await vi.advanceTimersByTimeAsync(2_000)

    expect(await done).toBe(false)
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()
  })

  it('stops watching after a long time without metadata, still without a single request', async () => {
    const store = useAddTorrentStore()
    torrentList.set('abc', { hasMetadata: false })

    const done = store.processExternalTorrentBlocklist('abc')
    await vi.advanceTimersByTimeAsync(31 * 60_000)

    expect(await done).toBe(false)
    expect(qbit.getTorrents).not.toHaveBeenCalled()
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()
  })

  it('removes a single-file torrent whose only file is excluded', async () => {
    const store = useAddTorrentStore()
    torrentList.set('abc', { hasMetadata: true })
    vi.mocked(qbit.getTorrentFiles).mockResolvedValue([file(0, 'Totally Real Movie.txt')] as never)

    const done = store.processExternalTorrentBlocklist('abc')
    await vi.advanceTimersByTimeAsync(10)

    expect(await done).toBe(true)
    expect(qbit.deleteTorrents).toHaveBeenCalledWith(['abc'], true)
    expect(qbit.setTorrentFilePriority).not.toHaveBeenCalled()
  })

  it('never has more than four torrents being fetched and updated at once, however many are waiting', async () => {
    const store = useAddTorrentStore()
    let inFlight = 0
    let peak = 0
    vi.mocked(qbit.getTorrentFiles).mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 200))
      inFlight--
      return releaseFiles as never
    })
    const hashes = Array.from({ length: 30 }, (_, i) => `hash${i}`)
    hashes.forEach(hash => torrentList.set(hash, { hasMetadata: true }))

    const all = Promise.all(hashes.map(hash => store.processExternalTorrentBlocklist(hash)))
    await vi.advanceTimersByTimeAsync(10_000)

    expect(await all).toEqual(hashes.map(() => true))
    expect(peak).toBe(4)
    expect(qbit.setTorrentFilePriority).toHaveBeenCalledTimes(30)
  })

  it('does nothing when no extensions are excluded', async () => {
    const store = useAddTorrentStore()
    const original = vueTorrentStore.allBlockedExtensions
    vueTorrentStore.allBlockedExtensions = []
    torrentList.set('abc', { hasMetadata: true })

    expect(await store.processExternalTorrentBlocklist('abc')).toBe(true)
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()

    vueTorrentStore.allBlockedExtensions = original
  })
})
