import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useAppStore } from './app'
import { usePreferenceStore } from './preferences'
import { useVueTorrentStore } from './vuetorrent'
import { extractMagnetHash } from '@/utils/helpers'
import { FilePriority, FilterState } from '@/constants/qbit'
import { StopCondition } from '@/constants/qbit/AppPreferences'
import { TorrentState } from '@/constants/vuetorrent'
import qbit from '@/services/qbit'
import { AddTorrentParams } from '@/types/qbit/models'
import { TorrentFile } from '@/types/qbit/models'
import { AddTorrentPayload } from '@/types/qbit/payloads'

/** How long (ms) to wait for magnet metadata before timing out */
const METADATA_TIMEOUT_MS = 60_000
/** How often (ms) to poll torrent state while waiting for metadata */
const METADATA_POLL_MS = 1_000

/**
 * Normalize a raw extension string to a lowercase dot-prefixed form.
 * e.g. "NFO", ".nfo", "nfo" → ".nfo"
 */
export function normalizeExtension(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  return trimmed.startsWith('.') ? trimmed : '.' + trimmed
}

/**
 * Returns the file indexes from `files` that match any of `blockedExts` (pre-normalized).
 */
export function getBlockedFileIds(files: TorrentFile[], blockedExts: string[]): number[] {
  if (blockedExts.length === 0) return []
  const extSet = new Set(blockedExts.map(normalizeExtension))
  return files
    .filter(f => {
      const namePart = f.name.replace(/\\/g, '/').split('/').pop() ?? f.name
      const dotIdx = namePart.lastIndexOf('.')
      if (dotIdx === -1) return false
      return extSet.has(namePart.slice(dotIdx).toLowerCase())
    })
    .map(f => f.index)
}

export const useAddTorrentStore = defineStore(
  'addTorrents',
  () => {
    const preferenceStore = usePreferenceStore()
    const appStore = useAppStore()
    const vueTorrentStore = useVueTorrentStore()

    const isFirstInit = ref(true)
    const isFirstFullSync = ref(true)

    const files = shallowRef<File[]>([])
    const urls = ref<string>('')

    const form = reactive<
      Partial<{
        cookie: string
        firstLastPiecePrio: boolean
        rename: string
        sequentialDownload: boolean
      }>
    >({})
    const addTorrentParams = reactive<AddTorrentParams>({})

    const pendingTorrentsCount = computed(() => files.value.length + urls.value.split('\n').filter(url => url.trim() !== '').length)

    function pushTorrentToQueue(torrentDescriptor: File | string) {
      initForm()
      if (torrentDescriptor instanceof File) {
        files.value.push(torrentDescriptor)
      } else {
        if (urls.value !== '') {
          urls.value += '\n'
        }
        urls.value += torrentDescriptor
      }
    }

    function initForm() {
      if (isFirstInit.value) {
        isFirstInit.value = false
        resetForm()
      }
    }

    function resetForm() {
      urls.value = ''
      files.value = []

      form.cookie = undefined
      form.firstLastPiecePrio = false
      form.rename = undefined
      form.sequentialDownload = false

      addTorrentParams.add_to_top_of_queue = preferenceStore.preferences!.add_to_top_of_queue
      addTorrentParams.category = undefined
      addTorrentParams.content_layout = preferenceStore.preferences!.torrent_content_layout
      addTorrentParams.download_limit = undefined
      addTorrentParams.download_path = preferenceStore.preferences!.temp_path_enabled ? preferenceStore.preferences!.temp_path : undefined
      addTorrentParams.forced = undefined
      addTorrentParams.inactive_seeding_time_limit = undefined
      addTorrentParams.ratio_limit = undefined
      addTorrentParams.save_path = preferenceStore.preferences!.save_path
      addTorrentParams.seeding_time_limit = undefined
      addTorrentParams.skip_checking = false
      addTorrentParams.stop_condition = preferenceStore.preferences!.torrent_stop_condition
      addTorrentParams.stopped = preferenceStore.preferences!.add_stopped_enabled ?? preferenceStore.preferences!.start_paused_enabled
      addTorrentParams.tags = undefined
      addTorrentParams.upload_limit = undefined
      addTorrentParams.use_auto_tmm = preferenceStore.preferences!.auto_tmm_enabled
      addTorrentParams.use_download_path = preferenceStore.preferences!.temp_path_enabled
    }

    /**
     * Add a torrent in stopped/paused state, poll until metadata is available,
     * then return the hash. Returns null on timeout or if hash detection fails.
     *
     * Uses before/after diff of getTorrents() since the WebAPI addTorrents endpoint
     * returns "Ok." with no hash in the response body.
     */
    const activeLocalAdds = ref(0)
    const deferredExternalHashes = ref<Set<string>>(new Set())
    watch(deferredExternalHashes, (val: any) => {
      if (!(val instanceof Set)) {
        deferredExternalHashes.value = new Set(Array.isArray(val) ? val : Object.keys(val || {}))
      }
    }, { immediate: true, deep: false })

    async function addTorrentStopped(torrentFiles: File[], torrentUrls: string, payload: AddTorrentPayload): Promise<string | null> {
      activeLocalAdds.value++
      try {
        // 1. For magnets, parse the hash directly from the URI to avoid diffing entirely
        let magnetHash: string | null = null
        if (torrentFiles.length === 0 && torrentUrls) {
          magnetHash = extractMagnetHash(torrentUrls)
        }

      // 2. Snapshot existing state for .torrent file diffing
      const beforeTime = Math.floor(Date.now() / 1000) - 2
      let torrentName: string | null = null
      if (torrentFiles.length > 0) {
        torrentName = torrentFiles[0].name.replace(/\.torrent$/i, '')
      }
      
      const existing = await qbit.getTorrents()
      const existingHashes = new Set(existing.map(t => t.infohash_v1 || '').filter(Boolean))

      // 3. Send add with stopped + MetadataReceived stop-condition (or paused fallback)
      const stoppedPayload: AddTorrentPayload = {
        ...payload,
        stopped: true,
        paused: true,
        stopCondition: appStore.isFeatureAvailable('4.5.0') ? StopCondition.METADATA_RECEIVED : undefined,
        tags: payload.tags ? `${payload.tags},vt-predownload` : 'vt-predownload', // Tag for cleanup
      }
      await qbit.addTorrents(torrentFiles, torrentUrls, stoppedPayload)

      // 4. Return immediately if it was a magnet and we extracted the hash
      if (magnetHash) return magnetHash

        // 5. Poll to find the new hash for .torrent files (tightly scoped to recently added)
        const deadline = Date.now() + 5_000
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 500))
          const current = await qbit.getTorrents()
          const candidates = current.filter(t => 
            t.infohash_v1 && 
            !existingHashes.has(t.infohash_v1) && 
            t.added_on >= beforeTime
          )

          if (candidates.length === 1) {
            return candidates[0].infohash_v1 || candidates[0].hash || null
          } else if (candidates.length > 1) {
            // Disambiguate by name if possible (normalized substring)
            if (torrentName) {
              const normalizedTarget = torrentName.toLowerCase().replace(/[^a-z0-9]/g, '')
              const match = candidates.find(t => {
                const normName = t.name.toLowerCase().replace(/[^a-z0-9]/g, '')
                return normName.includes(normalizedTarget) || normalizedTarget.includes(normName)
              })
              if (match) return match.infohash_v1 || match.hash || null
            }
            // Fallback to the newest one
            const newest = candidates.sort((a, b) => b.added_on - a.added_on)[0]
            return newest.infohash_v1 || newest.hash || null
          }
        }
        return null
      } finally {
        setTimeout(() => {
          activeLocalAdds.value--
        }, 2000)
      }
    }

    /**
     * Wait for a torrent to leave the "downloading metadata" state.
     * Returns true when ready, false on timeout or cancellation.
     * `onProgress` is called each poll tick with elapsed ms.
     * `cancelRef` can be set to true externally to abort the wait.
     */
    async function waitForMetadata(hash: string, cancelRef: { value: boolean }, onProgress?: (elapsedMs: number) => void): Promise<boolean> {
      const start = Date.now()
      const metaStates: TorrentState[] = [TorrentState.META_DOWNLOAD, TorrentState.FORCED_META_DOWNLOAD]

      while (Date.now() - start < METADATA_TIMEOUT_MS) {
        if (cancelRef.value) return false
        await new Promise(r => setTimeout(r, METADATA_POLL_MS))
        if (cancelRef.value) return false

        try {
          const torrents = await qbit.getTorrents({ hashes: hash })
          if (torrents.length === 0) return false // torrent was deleted externally

          const t = torrents[0]
          // qBit 5+ has explicit has_metadata flag; older: check state
          const hasMeta = t.has_metadata !== undefined ? t.has_metadata : !metaStates.includes(t.state as unknown as TorrentState)
          if (hasMeta) return true
        } catch {
          // transient network error — keep polling
        }

        onProgress?.(Date.now() - start)
      }
      return false
    }

    /**
     * Resume a torrent, handling qBit 4 vs 5 API difference.
     */
    async function resumeTorrent(hash: string) {
      if (appStore.isFeatureAvailable('5')) {
        await qbit.startTorrents([hash])
      } else {
        await qbit.resumeTorrents([hash])
      }
    }

    /**
     * Apply the extension blocklist silently: set priority 0 for matching files.
     * Used both in the picker (pre-fill unchecked state) and in silent background mode.
     */
    async function applyExtensionBlocklist(hash: string, torrentFiles: TorrentFile[]): Promise<number[]> {
      const blocked = getBlockedFileIds(torrentFiles, vueTorrentStore.blockedExtensions)
      if (blocked.length > 0) {
        await qbit.setTorrentFilePriority(hash, blocked, FilePriority.DO_NOT_DOWNLOAD)
      }
      return blocked
    }

    /**
     * Full silent pipeline: add stopped → wait for metadata → apply blocklist → resume.
     * Used when showPredownloadPicker = false but blockedExtensions is non-empty.
     */
    async function addTorrentWithBlocklist(torrentFiles: File[], torrentUrls: string, payload: AddTorrentPayload): Promise<void> {
      const hash = await addTorrentStopped(torrentFiles, torrentUrls, payload)
      if (!hash) {
        // Couldn't detect hash — fall through; torrent will download normally
        return
      }

      const cancelRef = { value: false }
      const ready = await waitForMetadata(hash, cancelRef)
      if (!ready) return

      const files = await qbit.getTorrentFiles(hash)
      await applyExtensionBlocklist(hash, files)
      await resumeTorrent(hash)
    }

    const pendingPickerHashes = ref<Set<string>>(new Set())
    watch(pendingPickerHashes, (val: any) => {
      if (!(val instanceof Set)) {
        pendingPickerHashes.value = new Set(Array.isArray(val) ? val : Object.keys(val || {}))
      }
    }, { immediate: true, deep: false })
    
    const processedExternalHashes = ref<string[]>([])

    async function processExternalTorrentBlocklist(hash: string) {
      if (vueTorrentStore.blockedExtensions.length === 0) return

      const cancelRef = { value: false }
      const ready = await waitForMetadata(hash, cancelRef)
      if (!ready) return

      const files = await qbit.getTorrentFiles(hash)
      await applyExtensionBlocklist(hash, files)
    }

    async function cleanupOrphanedTorrents() {
      try {
        const filter = appStore.isFeatureAvailable('5') ? FilterState.STOPPED : FilterState.PAUSED
        const torrents = await qbit.getTorrents({ filter })
        const orphanedHashes = torrents
          .filter(t => t.tags.includes('vt-predownload'))
          .filter(t => !pendingPickerHashes.value.has(t.infohash_v1 || t.hash || ''))
          .filter(t => Date.now() / 1000 - t.added_on > 300) // older than 5 minutes
          .map(t => t.infohash_v1 || t.hash || '')
          .filter(Boolean)

        if (orphanedHashes.length > 0) {
          await qbit.deleteTorrents(orphanedHashes, false)
        }
      } catch {
        // ignore errors during cleanup
      }
    }

    return {
      isFirstInit,
      files,
      urls,
      form,
      addTorrentParams,
      pendingTorrentsCount,
      pushTorrentToQueue,
      initForm,
      resetForm,
      addTorrentStopped,
      waitForMetadata,
      resumeTorrent,
      applyExtensionBlocklist,
      addTorrentWithBlocklist,
      cleanupOrphanedTorrents,
      pendingPickerHashes,
      processedExternalHashes,
      processExternalTorrentBlocklist,
      activeLocalAdds,
      deferredExternalHashes,
      isFirstFullSync,
      $reset: () => {
        isFirstInit.value = false
        resetForm()
      },
    }
  },
  {
    persistence: {
      enabled: true,
      storageItems: [
        { storage: sessionStorage, excludePaths: ['files', 'pendingPickerHashes', 'deferredExternalHashes', 'activeLocalAdds', 'isFirstFullSync'] },
        { storage: localStorage, includePaths: ['processedExternalHashes'] }
      ],
    },
  }
)

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAddTorrentStore, import.meta.hot))
}
