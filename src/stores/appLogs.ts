import toSorted from 'array.prototype.tosorted'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useArrayPagination, useSearchQuery } from '@/composables'
import { comparators } from '@/helpers'

export type AppLogLevel = 'info' | 'warning' | 'error'

export type AppLog = {
  id: number
  /** Unix time in seconds (of the latest occurrence) */
  timestamp: number
  level: AppLogLevel
  /** Which part of the app wrote it, e.g. 'app', 'network', 'settings' */
  source: string
  message: string
  details?: string
  /** How many times in a row the same entry happened */
  count: number
}

export const APP_LOG_LEVELS: AppLogLevel[] = ['info', 'warning', 'error']

/** Oldest entries are dropped past this, so a noisy error can't grow the stored logs without limit */
export const MAX_APP_LOGS = 300
const MAX_MESSAGE_LENGTH = 500
const MAX_DETAILS_LENGTH = 2000

function clip(text: string | undefined, max: number) {
  if (text === undefined) return undefined
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export const useAppLogStore = defineStore(
  'appLogs',
  () => {
    const logs = ref<AppLog[]>([])
    const nextId = ref(0)
    const levelFilter = ref<AppLogLevel[]>([...APP_LOG_LEVELS])
    const messageFilter = ref('')
    const reverseSort = ref(true)

    const filteredByLevel = computed(() => logs.value.filter(log => levelFilter.value.includes(log.level)))
    const { results: filteredLogs } = useSearchQuery(filteredByLevel, messageFilter, log => `${log.source} ${log.message} ${log.details ?? ''}`)
    const { paginatedResults, currentPage, pageCount } = useArrayPagination(
      () => toSorted(filteredLogs.value, (a, b) => comparators.numeric.compare(a.id, b.id, !reverseSort.value)),
      30
    )

    /** Adds an entry. The same entry repeating right after itself is counted instead of listed again. */
    function add(level: AppLogLevel, source: string, message: string, details?: string) {
      const text = clip(message, MAX_MESSAGE_LENGTH)!
      const now = Math.floor(Date.now() / 1000)
      const last = logs.value.at(-1)

      if (last && last.level === level && last.source === source && last.message === text) {
        last.count += 1
        last.timestamp = now
        return
      }

      logs.value.push({ id: nextId.value++, timestamp: now, level, source, message: text, details: clip(details, MAX_DETAILS_LENGTH), count: 1 })
      if (logs.value.length > MAX_APP_LOGS) {
        logs.value.splice(0, logs.value.length - MAX_APP_LOGS)
      }
    }

    function clear() {
      logs.value = []
    }

    /** Plain-text version for copying or downloading, oldest first */
    function toText(entries: AppLog[] = logs.value) {
      return toSorted(entries, (a, b) => a.id - b.id)
        .map(log => {
          const when = new Date(log.timestamp * 1000).toISOString()
          const times = log.count > 1 ? ` (x${log.count})` : ''
          const details = log.details ? `\n    ${log.details.replace(/\n/g, '\n    ')}` : ''
          return `${when} [${log.level.toUpperCase()}] [${log.source}] ${log.message}${times}${details}`
        })
        .join('\n')
    }

    return {
      logs,
      filteredLogs,
      levelFilter,
      messageFilter,
      reverseSort,
      paginatedResults,
      currentPage,
      pageCount,
      add,
      clear,
      toText,
      $reset: () => {
        logs.value = []
        nextId.value = 0
        levelFilter.value = [...APP_LOG_LEVELS]
        messageFilter.value = ''
        reverseSort.value = true
      },
    }
  },
  {
    persistence: {
      enabled: true,
      // Kept across refreshes on purpose: the moments worth reading about are often the ones that end in a reload
      storageItems: [{ storage: localStorage, includePaths: ['logs', 'nextId', 'levelFilter', 'reverseSort'] }],
    },
  }
)

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppLogStore, import.meta.hot))
}
