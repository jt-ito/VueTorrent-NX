import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import qbit from '@/services/qbit'
import { usePreferenceStore } from '@/stores/preferences'
import { getChangedEntries } from '@/utils/helpers'

vi.mock('@/services/qbit', () => ({
  default: {
    getPreferences: vi.fn(),
    setPreferences: vi.fn(),
  },
}))

const serverPrefs = () => ({ listen_port: 50000, current_network_interface: 'tun0', save_path: '/downloads', excluded_file_names: '' }) as any

describe('getChangedEntries', () => {
  it('returns only the entries that differ', () => {
    expect(getChangedEntries({ a: 1, b: 'x', c: [1, 2] }, { a: 1, b: 'y', c: [1, 2] })).toEqual({ b: 'x' })
  })

  it('compares arrays and objects by value, and treats missing baseline keys as changed', () => {
    expect(getChangedEntries({ list: [1, 2, 3], nested: { k: 1 }, extra: 0 }, { list: [1, 2], nested: { k: 1 } })).toEqual({ list: [1, 2, 3], extra: 0 })
  })

  it('returns nothing when nothing changed', () => {
    expect(getChangedEntries({ a: 1 }, { a: 1 })).toEqual({})
  })
})

describe('preference store: saving', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(qbit.getPreferences).mockResolvedValue(serverPrefs())
  })

  it('sends nothing when only VueTorrent-side settings were changed (no qBittorrent setting differs)', async () => {
    const store = usePreferenceStore()
    await store.fetchPreferences()

    await store.setPreferences()

    expect(qbit.setPreferences).not.toHaveBeenCalled()
  })

  it('sends only the settings that were changed, never the rest of the (possibly outdated) copy', async () => {
    const store = usePreferenceStore()
    await store.fetchPreferences()
    store.preferences!.save_path = '/media'

    await store.setPreferences()

    expect(qbit.setPreferences).toHaveBeenCalledTimes(1)
    expect(qbit.setPreferences).toHaveBeenCalledWith({ save_path: '/media' })
  })

  it('does not put back an old listening port that changed on the server after the page loaded', async () => {
    const store = usePreferenceStore()
    await store.fetchPreferences() // page loads with listen_port 50000
    // ...meanwhile the VPN hands out a new port and updates qBittorrent directly; this page's copy is now outdated
    store.preferences!.excluded_file_names = '*.nfo'

    await store.setPreferences()

    const sent = vi.mocked(qbit.setPreferences).mock.calls[0][0] as Record<string, unknown>
    expect(sent).toEqual({ excluded_file_names: '*.nfo' })
    expect(sent).not.toHaveProperty('listen_port')
  })

  it('still sends an explicit payload exactly as given', async () => {
    const store = usePreferenceStore()
    await store.fetchPreferences()

    await store.setPreferences({ delete_torrent_content_files: true })

    expect(qbit.setPreferences).toHaveBeenCalledWith({ delete_torrent_content_files: true })
  })

  it('a fresh fetch after saving becomes the new baseline', async () => {
    const store = usePreferenceStore()
    await store.fetchPreferences()
    store.preferences!.save_path = '/media'
    await store.setPreferences()

    vi.mocked(qbit.getPreferences).mockResolvedValue({ ...serverPrefs(), save_path: '/media' })
    await store.fetchPreferences()
    vi.mocked(qbit.setPreferences).mockClear()
    await store.setPreferences()

    expect(qbit.setPreferences).not.toHaveBeenCalled()
  })
})
