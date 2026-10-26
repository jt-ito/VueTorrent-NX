import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import qbit from '@/services/qbit'
import AppPreferences from '@/types/qbit/models/AppPreferences'
import { AppPreferencesPayload } from '@/types/qbit/payloads'
import { getChangedEntries } from '@/utils/helpers'

export const usePreferenceStore = defineStore(
  'preferences',
  () => {
    const preferences = ref<AppPreferences>()
    // A copy of what qBittorrent last reported, so saving can send only what the user changed
    const loadedPreferences = ref<AppPreferences>()

    async function fetchPreferences() {
      const fresh = await qbit.getPreferences()
      preferences.value = fresh
      loadedPreferences.value = JSON.parse(JSON.stringify(fresh))
    }

    /**
     * With an explicit payload, sends exactly that. Without one, sends only the settings that differ from what was loaded.
     * Sending the whole object would overwrite anything changed on the server since the page loaded (listening port,
     * network interface...) with outdated values, even when the user only changed a VueTorrent-side setting.
     */
    /** @returns the names of the settings that were sent (empty when nothing needed sending) */
    async function setPreferences(newPref?: AppPreferencesPayload): Promise<string[]> {
      if (newPref) {
        await qbit.setPreferences(newPref)
        return Object.keys(newPref)
      }

      const current = preferences.value!
      const changed = loadedPreferences.value ? getChangedEntries(current, loadedPreferences.value) : current
      const names = Object.keys(changed)
      if (names.length === 0) return []

      await qbit.setPreferences(changed)
      return names
    }

    return {
      preferences,
      loadedPreferences,
      fetchPreferences,
      setPreferences,
      $reset: async () => {
        await fetchPreferences()
      },
    }
  },
  {
    persistence: {
      enabled: true,
      storageItems: [{ storage: sessionStorage }],
    },
  }
)

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePreferenceStore, import.meta.hot))
}
