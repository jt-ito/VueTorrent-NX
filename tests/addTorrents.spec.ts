import { describe, expect, it, vi, beforeEach } from 'vitest'
import { normalizeExtension, extractMagnetHash } from '@/utils/helpers'
import { setActivePinia, createPinia } from 'pinia'
import { useAddTorrentStore, getBlockedFileIds } from '@/stores/addTorrents'
import { FilePriority } from '@/constants/qbit'
import qbit from '@/services/qbit'

// Mock the entire qbit service
vi.mock('@/services/qbit', () => {
  return {
    default: {
      getTorrents: vi.fn(),
      deleteTorrents: vi.fn(),
      getTorrentFiles: vi.fn(),
      setTorrentFilePriority: vi.fn(),
    }
  }
})

// Mock other stores and features
vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ isFeatureAvailable: vi.fn().mockReturnValue(true) })
}))
vi.mock('@/stores/preferences', () => ({
  usePreferenceStore: () => ({ preferences: { auto_tmm_enabled: true, temp_path_enabled: true } })
}))
const mockVueTorrentStore = {
  blockedExtensions: ['.nfo'],
  allBlockedExtensions: ['.nfo', '.txt'],
  skipPickerForSingleFile: false,
}
vi.mock('@/stores/vuetorrent', () => ({
  useVueTorrentStore: () => mockVueTorrentStore
}))

describe('addTorrents Helpers & Logic', () => {
  describe('normalizeExtension', () => {
    it('normalizes missing dot and uppercase', () => {
      expect(normalizeExtension('NFO')).toBe('.nfo')
      expect(normalizeExtension('nfo')).toBe('.nfo')
    })
    
    it('strips leading wildcards and dots', () => {
      expect(normalizeExtension('*.nfo')).toBe('.nfo')
      expect(normalizeExtension('..nfo')).toBe('.nfo')
      expect(normalizeExtension('.*.nfo')).toBe('.nfo')
    })

    it('returns null for empty or whitespace strings', () => {
      expect(normalizeExtension('')).toBeNull()
      expect(normalizeExtension('   ')).toBeNull()
    })

    it('trims whitespace', () => {
      expect(normalizeExtension('  .nfo  ')).toBe('.nfo')
    })
  })

  describe('getBlockedFileIds', () => {
    const files = [
      { index: 0, name: 'movie.mp4', size: 1000, progress: 0, priority: 1, is_seed: false, piece_range: [0, 10], availability: 1 },
      { index: 1, name: 'info.nfo', size: 100, progress: 0, priority: 1, is_seed: false, piece_range: [11, 12], availability: 1 },
      { index: 2, name: 'subtitles/sub.srt', size: 50, progress: 0, priority: 1, is_seed: false, piece_range: [13, 14], availability: 1 },
      { index: 3, name: 'notes.TXT', size: 20, progress: 0, priority: 1, is_seed: false, piece_range: [15, 16], availability: 1 },
    ]

    it('matches extensions with or without wildcard and leading dot', () => {
      expect(getBlockedFileIds(files as any, ['*.nfo', 'txt'])).toEqual([1, 3])
    })

    it('returns empty array when blocked list is empty', () => {
      expect(getBlockedFileIds(files as any, [])).toEqual([])
    })

    it('handles nested folder paths correctly', () => {
      expect(getBlockedFileIds(files as any, ['.srt'])).toEqual([2])
    })
  })

  describe('extractMagnetHash', () => {
    it('extracts hash from a valid magnet URI', () => {
      expect(extractMagnetHash('magnet:?xt=urn:btih:3b137d53086eb0a00')).toBe('3b137d53086eb0a00')
    })

    it('extracts hash regardless of case', () => {
      expect(extractMagnetHash('magnet:?xt=urn:btih:3B137d53086EB0A00')).toBe('3b137d53086eb0a00')
    })

    it('extracts hash even with multiple parameters', () => {
      expect(extractMagnetHash('magnet:?dn=Ubuntu&xt=urn:btih:1234567890abcdef&tr=http://tracker')).toBe('1234567890abcdef')
    })

    it('returns null if hash is missing or malformed', () => {
      expect(extractMagnetHash('magnet:?dn=Ubuntu')).toBeNull()
      expect(extractMagnetHash('invalid-string')).toBeNull()
    })
  })

  describe('waitForMetadata', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
      vi.clearAllMocks()
    })

    it('does not immediately return true while torrent is in metaDL state', async () => {
      const store = useAddTorrentStore()
      let callCount = 0
      // @ts-ignore
      qbit.getTorrents.mockImplementation(async () => {
        callCount++
        if (callCount < 2) {
          return [{ hash: 'testhash', state: 'metaDL' }]
        }
        return [{ hash: 'testhash', state: 'downloading' }]
      })

      const cancelRef = { value: false }
      const ready = await store.waitForMetadata('testhash', cancelRef)
      expect(ready).toBe(true)
      expect(callCount).toBeGreaterThanOrEqual(2)
    })

    it('recognizes has_metadata = true on qBit 5', async () => {
      const store = useAddTorrentStore()
      // @ts-ignore
      qbit.getTorrents.mockResolvedValueOnce([{ hash: 'testhash', state: 'downloading', has_metadata: true }])

      const cancelRef = { value: false }
      const ready = await store.waitForMetadata('testhash', cancelRef)
      expect(ready).toBe(true)
    })
  })

  describe('processExternalTorrentBlocklist', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
      vi.clearAllMocks()
    })

    it('applies DO_NOT_DOWNLOAD to files matching allBlockedExtensions', async () => {
      const store = useAddTorrentStore()
      // @ts-ignore
      qbit.getTorrents.mockResolvedValue([{ hash: 'testhash', state: 'downloading', has_metadata: true }])
      // @ts-ignore
      qbit.getTorrentFiles.mockResolvedValue([
        { index: 0, name: 'video.mkv' },
        { index: 1, name: 'sample.nfo' },
        { index: 2, name: 'read.txt' },
      ])
      // @ts-ignore
      qbit.setTorrentFilePriority.mockResolvedValue(undefined)

      const success = await store.processExternalTorrentBlocklist('testhash')
      expect(success).toBe(true)
      expect(qbit.setTorrentFilePriority).toHaveBeenCalledWith('testhash', [1, 2], FilePriority.DO_NOT_DOWNLOAD)
    })

    it('prevents concurrent overlapping execution for the same hash', async () => {
      const store = useAddTorrentStore()
      // @ts-ignore
      qbit.getTorrents.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 50))
        return [{ hash: 'testhash', state: 'downloading', has_metadata: true }]
      })
      // @ts-ignore
      qbit.getTorrentFiles.mockResolvedValue([{ index: 0, name: 'video.mkv' }])

      const p1 = store.processExternalTorrentBlocklist('testhash')
      const p2 = store.processExternalTorrentBlocklist('testhash')

      const [res1, res2] = await Promise.all([p1, p2])
      expect(res1).toBe(true)
      expect(res2).toBe(false) // rejected duplicate concurrent call
    })
  })

  describe('cleanupOrphanedTorrents', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
      vi.clearAllMocks()
    })

    it('sweeps only older torrents without pending picker', async () => {
      const store = useAddTorrentStore()
      store.pendingPickerHashes.add('hash_pending')

      const mockTorrents = [
        { hash: 'hash_old', tags: 'vt-predownload', added_on: Date.now() / 1000 - 400 }, // > 5 min ago
        { hash: 'hash_new', tags: 'vt-predownload', added_on: Date.now() / 1000 - 100 }, // < 5 min ago
        { hash: 'hash_pending', tags: 'vt-predownload', added_on: Date.now() / 1000 - 600 }, // > 5 min, but pending
        { hash: 'hash_other', tags: 'other', added_on: Date.now() / 1000 - 400 } // no tag
      ]
      
      // @ts-ignore
      qbit.getTorrents.mockResolvedValue(mockTorrents)

      await store.cleanupOrphanedTorrents()

      expect(qbit.deleteTorrents).toHaveBeenCalledWith(['hash_old'], false)
    })
  })
})
