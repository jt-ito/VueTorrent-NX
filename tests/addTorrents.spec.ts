import { describe, expect, it, vi, beforeEach } from 'vitest'
import { normalizeExtension, extractMagnetHash } from '@/utils/helpers'
import { setActivePinia, createPinia } from 'pinia'
import { useAddTorrentStore } from '@/stores/addTorrents'
import qbit from '@/services/qbit'

// Mock the entire qbit service
vi.mock('@/services/qbit', () => {
  return {
    default: {
      getTorrents: vi.fn(),
      deleteTorrents: vi.fn()
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
vi.mock('@/stores/vuetorrent', () => ({
  useVueTorrentStore: () => ({ blockedExtensions: [] })
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
