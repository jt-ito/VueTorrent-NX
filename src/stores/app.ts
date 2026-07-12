import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import qbit from '@/services/qbit'
import { BuildInfo } from '@/types/qbit/models'

export const useAppStore = defineStore('app', () => {
  const isAuthenticated = ref(false)
  const version = ref('0.0.0')
  const buildInfo = ref<BuildInfo>()

  // Session-only credential cache for silent re-login (never persisted)
  const _sessionUsername = ref('')
  const _sessionPassword = ref('')

  const usesQbit5 = computed(() => isFeatureAvailable('5'))
  const usesLibtorrent1 = computed(() => (buildInfo.value?.libtorrent ?? '') >= '1' && !usesLibtorrent2.value)
  const usesLibtorrent2 = computed(() => (buildInfo.value?.libtorrent ?? '') >= '2')

  async function fetchAuthStatus() {
    const ver: string | false = await qbit.getVersion().catch(() => false)
    const auth_status = ver !== false
    await setAuthStatus(auth_status, ver || undefined)
    return auth_status
  }

  async function setAuthStatus(val: boolean, ver?: string) {
    isAuthenticated.value = val

    if (val) {
      version.value = ver || (await qbit.getVersion())
      buildInfo.value = await qbit.getBuildInfo()
    } else {
      version.value = '0.0.0'
      buildInfo.value = undefined
    }
  }

  function isFeatureAvailable(required_version?: string) {
    if (!required_version) return true
    return version.value >= required_version
  }

  async function login(username: string, password: string) {
    const response = await qbit.login({ username, password })
    console.log('[Auth Diagnostic] Login response headers:', response.headers)
    if (response.status >= 200 && response.status < 300) {
      // Cache credentials in-session for silent re-login (not persisted)
      _sessionUsername.value = username
      _sessionPassword.value = password
    }
    await setAuthStatus(response.status < 300 && response.status >= 200)
    return response
  }

  async function logout() {
    await qbit.logout()
    _sessionUsername.value = ''
    _sessionPassword.value = ''
    await setAuthStatus(false)
  }

  /**
   * Attempt a silent re-login using in-memory credentials from the current session.
   * Called by the QbitProvider 403 interceptor. Returns true if re-login succeeded.
   * Never stores credentials beyond the current session.
   */
  async function silentRelogin(): Promise<boolean> {
    if (!_sessionUsername.value || !_sessionPassword.value) return false
    try {
      const response = await qbit.login({ username: _sessionUsername.value, password: _sessionPassword.value })
      const ok = response.status >= 200 && response.status < 300 && response.data !== 'Fails.'
      if (ok) {
        await setAuthStatus(true)
      }
      return ok
    } catch {
      return false
    }
  }

  /**
   * Apply API key auth if one is stored in VueTorrent settings.
   * Call this at app startup after vueTorrentStore is hydrated.
   */
  async function initApiKey() {
    // Dynamically import to avoid circular deps
    const { useVueTorrentStore } = await import('@/stores/vuetorrent')
    const vueTorrentStore = useVueTorrentStore()
    if (vueTorrentStore.vueTorrentApiKey) {
      qbit.setApiKey(vueTorrentStore.vueTorrentApiKey)
    }
  }

  async function toggleAlternativeMode() {
    return await qbit.toggleSpeedLimitsMode()
  }

  async function shutdownQbit() {
    return await qbit.shutdownApp()
  }

  async function sendTestEmail() {
    return await qbit.sendTestEmail()
  }

  return {
    isAuthenticated,
    version,
    buildInfo,
    usesQbit5,
    usesLibtorrent1,
    usesLibtorrent2,
    fetchAuthStatus,
    setAuthStatus,
    isFeatureAvailable,
    shutdownQbit,
    sendTestEmail,
    login,
    logout,
    silentRelogin,
    initApiKey,
    toggleAlternativeMode,
    $reset: async () => {
      buildInfo.value = undefined
      version.value = '0.0.0'
      _sessionUsername.value = ''
      _sessionPassword.value = ''
      await logout()
    },
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot))
}
