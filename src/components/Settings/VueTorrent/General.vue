<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, readonly, ref } from 'vue'
import { toast } from 'vue3-toastify'
import ImportSettingsDialog from '@/components/Dialogs/ImportSettingsDialog.vue'
import { useI18nUtils } from '@/composables'
import { defaultDateFormat, defaultDurationFormat, FilterType, TitleOptions, TorrentDetailTab } from '@/constants/vuetorrent'
import { downloadFile, openLink } from '@/helpers'
import { LOCALES } from '@/locales'
import { backend } from '@/services/backend'
import qbit from '@/services/qbit'
import { Github } from '@/services/Github'
import { useAppStore, useDialogStore, useHistoryStore, useTorrentStore, useVueTorrentStore, usePreferenceStore } from '@/stores'
import { DarkLegacy, DarkOled, DarkRedesigned, LightLegacy, LightRedesigned } from '@/themes'
import { normalizeExtension, reconcileNativeExcludedFiles } from '@/utils/helpers'

const { t } = useI18nUtils()
const appStore = useAppStore()
const dialogStore = useDialogStore()
const historyStore = useHistoryStore()
const { filterType } = storeToRefs(useTorrentStore())
const vueTorrentStore = useVueTorrentStore()
const preferenceStore = usePreferenceStore()

// ── Feature 3: API key management ────────────────────────────────────────────
const apiKeyInput = ref(vueTorrentStore.vueTorrentApiKey)
const showApiKey = ref(false)
const isHttpsOrLocalhost = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

function applyApiKey() {
  vueTorrentStore.vueTorrentApiKey = apiKeyInput.value.trim()
  if (vueTorrentStore.vueTorrentApiKey) {
    qbit.setApiKey(vueTorrentStore.vueTorrentApiKey)
    toast.success(t('settings.vuetorrent.general.torrent_adding.apiKey.applied'))
  } else {
    qbit.clearApiKey()
    toast.success(t('settings.vuetorrent.general.torrent_adding.apiKey.cleared'))
  }
}

async function copyApiKey() {
  if (!apiKeyInput.value) return
  await navigator.clipboard.writeText(apiKeyInput.value)
  toast.success(t('toast.copy.success'))
}

// ── Feature 2: Extension blocklist chip input ─────────────────────────────────
const extensionInput = ref('')

function addExtension() {
  const normalized = normalizeExtension(extensionInput.value)
  if (!normalized) return
  if (!vueTorrentStore.blockedExtensions.includes(normalized)) {
    vueTorrentStore.blockedExtensions = [...vueTorrentStore.blockedExtensions, normalized]
    vueTorrentStore.syncNativeBlocklist()
  }
  extensionInput.value = ''
}

function removeExtension(ext: string) {
  vueTorrentStore.blockedExtensions = vueTorrentStore.blockedExtensions.filter(e => e !== ext)
  vueTorrentStore.syncNativeBlocklist()
}

async function enableNativeExclusion() {
  if (!preferenceStore.preferences) return
  try {
    await qbit.setPreferences({ excluded_file_names_enabled: true })
    preferenceStore.preferences.excluded_file_names_enabled = true
    toast.success('Native exclusions enabled')
  } catch (e) {
    toast.error('Failed to enable native exclusions')
  }
}

async function disableNativeExclusion() {
  if (!preferenceStore.preferences) return
  try {
    await qbit.setPreferences({ excluded_file_names_enabled: false })
    preferenceStore.preferences.excluded_file_names_enabled = false
    toast.success('Native exclusions disabled')
  } catch (e) {
    toast.error('Failed to disable native exclusions')
  }
}

const github = new Github()

const torrentDetailTabs = readonly([
  { title: t('settings.vuetorrent.general.lastOpenedTab'), value: TorrentDetailTab.LAST_OPENED },
  { title: t('torrentDetail.tabs.overview'), value: TorrentDetailTab.OVERVIEW },
  { title: t('torrentDetail.tabs.info'), value: TorrentDetailTab.INFO },
  { title: t('torrentDetail.tabs.trackers'), value: TorrentDetailTab.TRACKERS },
  { title: t('torrentDetail.tabs.peers'), value: TorrentDetailTab.PEERS },
  { title: t('torrentDetail.tabs.content'), value: TorrentDetailTab.CONTENT },
  { title: t('torrentDetail.tabs.tagsAndCategories'), value: TorrentDetailTab.TAGS_AND_CATEGORIES }
])

const titleOptionsList = readonly([
  { title: t('constants.titleOptions.default'), value: TitleOptions.DEFAULT },
  { title: t('constants.titleOptions.global_speed'), value: TitleOptions.GLOBAL_SPEED },
  { title: t('constants.titleOptions.first_torrent_speed'), value: TitleOptions.FIRST_TORRENT_STATUS },
  { title: t('constants.titleOptions.custom'), value: TitleOptions.CUSTOM }
])

const filterInclusionOptions = [
  { title: t('constants.filter_type.conjunctive'), value: FilterType.CONJUNCTIVE, props: { prependIcon: 'mdi-set-center' } },
  { title: t('constants.filter_type.disjunctive'), value: FilterType.DISJUNCTIVE, props: { prependIcon: 'mdi-set-all' } }
]

const lightVariants = readonly([
  { title: t('constants.themes.light.legacy'), value: LightLegacy.id },
  { title: t('constants.themes.light.redesigned'), value: LightRedesigned.id }
])

const darkVariants = readonly([
  { title: t('constants.themes.dark.legacy'), value: DarkLegacy.id },
  { title: t('constants.themes.dark.redesigned'), value: DarkRedesigned.id },
  { title: t('constants.themes.dark.oled'), value: DarkOled.id }
])


const paginationSizes = ref([{ title: t('settings.vuetorrent.general.paginationSize.infinite_scroll'), value: -1 }, 5, 15, 30, 50, 100, 250, 500])

const VERSION_PATTERN = /^v?(?<version>[0-9.]+)(-(?<commits>\d+)-g(?<sha>[0-9a-f]+))?$/
const vueTorrentVersion = computed(() => {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_PACKAGE_VERSION
  } else if (import.meta.env.DEV) {
    return 'DEV'
  }

  return null
})
const isStableVersion = computed(() => {
  const matches = vueTorrentVersion.value.match(VERSION_PATTERN)
  if (!matches) return false

  const groups = matches.groups
  return !groups.commits && !groups.sha
})

const paginationSize = computed({
  get: () => {
    if (vueTorrentStore.paginationSize === -1) return t('settings.vuetorrent.general.paginationSize.infinite_scroll')
    return vueTorrentStore.paginationSize.toString()
  },
  set: (v: string) => {
    const input = parseInt(v, 10)
    if (isNaN(input)) return

    if (input <= 0 && input !== -1) {
      vueTorrentStore.paginationSize = -1
    } else {
      vueTorrentStore.paginationSize = input
    }
  }
})

const paginationSizeMessages = computed(() =>
  vueTorrentStore.paginationSize === -1 || vueTorrentStore.paginationSize >= 250 ? t('settings.vuetorrent.general.paginationSize.warning') : ''
)

async function resetSettings() {
  if (preferenceStore.preferences) {
    try {
      await qbit.setPreferences({ excluded_file_names: '', excluded_file_names_enabled: false })
    } catch(e) {
      // Ignore
    }
  }
  localStorage.clear()
  sessionStorage.clear()
  location.reload()
}

function downloadSettings() {
  const settings = localStorage.getItem('vuetorrent_webuiSettings')
  if (!settings) {
    toast.warn(t('toast.export.no_settings'))
    return
  }

  const jsonString = JSON.stringify(JSON.parse(settings), null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })

  const currentVersion = vueTorrentVersion.value
  const currentTimestamp = new Date().toISOString()
  downloadFile(`VueTorrent_${currentVersion}_${currentTimestamp}.json`, blob)
}

function importSettings() {
  dialogStore.createDialog(ImportSettingsDialog)
}

function registerMagnetHandler() {
  if (typeof navigator.registerProtocolHandler !== 'function') {
    toast.error(t('toast.magnet_handler.not_supported'))
    return
  }

  const templateUrl = location.href.replace('/settings', '/magnet/%s')
  navigator.registerProtocolHandler('magnet', templateUrl)
  toast.success(t('toast.magnet_handler.registered'))
}

async function checkNewVersion() {
  if (vueTorrentVersion.value === 'DEV') return

  if (backend.isUp) {
    await backend
      .update()
      .then(data => {
        toast.success(data.message, { autoClose: 3000 })
        if (data.was_updated) {
          setTimeout(() => location.reload(), 1500)
        }
      })
      .catch(err => toast.error(`${err.status} ${err.message}`, { autoClose: 5000 }))
    return
  }

  const latest = await github.getVersion()
  if (`v${vueTorrentVersion.value}` === latest) {
    toast.success(t('toast.version.latest'))
    return
  }

  toast.info(t('toast.version.new'))
}

function openDateFormatHelp() {
  openLink('https://day.js.org/docs/en/display/format#list-of-all-available-formats')
}

function openDurationFormatHelp() {
  openLink('https://day.js.org/docs/en/durations/format#list-of-all-available-formats')
}
</script>

<template>
  <v-list>
    <v-list-subheader>{{ t('settings.vuetorrent.general.tip') }}</v-list-subheader>

    <v-list-item>
      <v-row>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.enableRatioColors" hide-details density="compact" :label="t('settings.vuetorrent.general.enableRatioColors')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.enableHashColors" hide-details density="compact" :label="t('settings.vuetorrent.general.enableHashColors')" />
        </v-col>

        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.hideChipIfUnset" hide-details density="compact" :label="t('settings.vuetorrent.general.hideChipIfUnset')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.hideColoredChip" hide-details density="compact" :label="t('settings.vuetorrent.general.hideColoredChip')" />
        </v-col>

        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.displayGraphLimits" hide-details density="compact" :label="t('settings.vuetorrent.general.displayGraphLimits')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.isShutdownButtonVisible" hide-details density="compact" :label="t('settings.vuetorrent.general.isShutdownButtonVisible')" />
        </v-col>

        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.useEmojiState" hide-details density="compact" :label="t('settings.vuetorrent.general.useEmojiState')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.fetchExternalIpInfo" hide-details density="compact" :label="t('settings.vuetorrent.general.fetchExternalIpInfo')" />
        </v-col>

        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.useBinarySize" hide-details density="compact" :label="t('settings.vuetorrent.general.useBinarySize')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.useBitSpeed" hide-details density="compact" :label="t('settings.vuetorrent.general.useBitSpeed')" />
        </v-col>

        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.expandContent" hide-details density="compact" :label="t('settings.vuetorrent.general.expandContent')" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-checkbox v-model="vueTorrentStore.reduceMotion" hide-details density="compact" :label="t('settings.vuetorrent.general.reduceMotion')" />
        </v-col>
      </v-row>
    </v-list-item>

    <v-list-item class="mt-3">
      <v-row>
        <v-col cols="12" md="4">
          <v-text-field v-model.number="vueTorrentStore.refreshInterval" type="number" hide-details suffix="ms" :label="t('settings.vuetorrent.general.refreshInterval')" />
        </v-col>
        <v-col cols="12" md="4">
          <v-text-field v-model.number="vueTorrentStore.fileContentInterval" type="number" hide-details suffix="ms" :label="t('settings.vuetorrent.general.fileContentInterval')" />
        </v-col>
        <v-col cols="12" md="4">
          <v-text-field v-model.number="historyStore.historySize" type="number" hide-details :label="t('settings.vuetorrent.general.historySize')" />
        </v-col>

        <v-col cols="12" md="6">
          <v-select v-model="vueTorrentStore.language" flat hide-details :items="LOCALES" :label="t('settings.vuetorrent.general.language')" />
        </v-col>
        <v-col cols="12" md="6">
          <v-select v-model="filterType" flat hide-details :items="filterInclusionOptions" :label="t('settings.vuetorrent.general.filterType')" />
        </v-col>

        <v-col cols="12" md="6">
          <v-select v-model="vueTorrentStore.uiTitleType" flat hide-details :items="titleOptionsList" :label="t('settings.vuetorrent.general.vueTorrentTitle')" />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="vueTorrentStore.uiTitleCustom"
            :disabled="vueTorrentStore.uiTitleType !== TitleOptions.CUSTOM"
            hide-details
            :label="t('settings.vuetorrent.general.customTitle')" />
        </v-col>

        <v-col cols="12" md="6">
          <v-select v-model="vueTorrentStore.theme.light" flat hide-details :items="lightVariants" :label="$t('settings.vuetorrent.general.lightVariants')" />
        </v-col>
        <v-col cols="12" md="6">
          <v-select v-model="vueTorrentStore.theme.dark" flat hide-details :items="darkVariants" :label="$t('settings.vuetorrent.general.darkVariants')" />
        </v-col>

        <v-col cols="12" md="3">
          <v-select v-model="vueTorrentStore.defaultTorrentDetailTab" flat hide-details :items="torrentDetailTabs" :label="t('settings.vuetorrent.general.defaultTorrentDetailTab')" />
        </v-col>
        <v-col cols="12" md="3">
          <v-combobox
            v-model.number="paginationSize"
            :messages="paginationSizeMessages"
            flat
            :items="paginationSizes"
            :return-object="false"
            :label="t('settings.vuetorrent.general.paginationSize.label')" />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="vueTorrentStore.dateFormat"
            flat
            hide-details
            :label="t('settings.vuetorrent.general.dateFormat')"
            :placeholder="defaultDateFormat"
            append-inner-icon="mdi-help-circle"
            @click:append-inner="openDateFormatHelp" />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="vueTorrentStore.durationFormat"
            flat
            hide-details
            :label="t('settings.vuetorrent.general.durationFormat')"
            :placeholder="defaultDurationFormat"
            append-inner-icon="mdi-help-circle"
            @click:append-inner="openDurationFormatHelp" />
        </v-col>

        <v-col cols="12" md="12">
          <v-text-field
            v-model="vueTorrentStore.logoutUrl"
            flat
            hide-details
            :label="t('settings.vuetorrent.general.logoutUrl')"
            placeholder="https://auth.example.com/logout" />
        </v-col>
      </v-row>
    </v-list-item>

    <v-list-item>
      <v-row>
        <v-col cols="6" class="d-flex align-center justify-center">
          <h3>
            {{ t('settings.vuetorrent.general.currentVersion') }}
            <span v-if="!vueTorrentVersion">undefined</span>
            <a v-else-if="vueTorrentVersion === 'DEV'" target="_blank" href="https://github.com/VueTorrent/VueTorrent">{{ vueTorrentVersion }}</a>
            <a v-else-if="isStableVersion" target="_blank" href="https://github.com/VueTorrent/VueTorrent/releases/latest">{{ vueTorrentVersion }}</a>
            <a v-else target="_blank" href="https://github.com/VueTorrent/VueTorrent/releases/tag/latest_nightly">{{ vueTorrentVersion }}</a>
          </h3>
        </v-col>

        <v-col cols="6" class="d-flex align-center justify-center">
          <v-btn color="primary" @click="registerMagnetHandler">
            {{ t('settings.vuetorrent.general.registerMagnet') }}
          </v-btn>
        </v-col>
      </v-row>
    </v-list-item>

    <v-list-item>
      <v-row>
        <v-col cols="12" sm="6" class="d-flex align-center justify-center">
          <h3>
            {{ t('settings.vuetorrent.general.qbittorrentVersion') }}
            <a target="_blank" :href="`https://github.com/qbittorrent/qBittorrent/releases/tag/release-${appStore.version}`">{{ appStore.version }}</a>
          </h3>
        </v-col>
        <v-col cols="12" sm="6" class="d-flex align-center justify-center">
          <v-btn color="primary" @click="checkNewVersion">
            {{ t('settings.vuetorrent.general.check_new') }}
          </v-btn>
        </v-col>
      </v-row>
    </v-list-item>

    <v-list-item>
      <v-row>
        <v-col cols="12" sm="4" class="d-flex align-center justify-center">
          <v-btn color="primary" @click="importSettings">
            {{ t('settings.vuetorrent.general.import') }}
          </v-btn>
        </v-col>
        <v-col cols="12" sm="4" class="d-flex align-center justify-center">
          <v-tooltip location="bottom">
            <template #activator="{ props }">
              <v-btn color="primary" v-bind="props" @click="downloadSettings">
                {{ t('settings.vuetorrent.general.download') }}
              </v-btn>
            </template>
            {{ t('settings.vuetorrent.general.exportTooltip') }}
          </v-tooltip>
        </v-col>
        <v-col cols="12" sm="4" class="d-flex align-center justify-center">
          <v-btn color="red" @click="resetSettings">
            {{ t('settings.vuetorrent.general.resetSettings') }}
          </v-btn>
        </v-col>
      </v-row>
    </v-list-item>

    <!-- ── Torrent Adding section (Features 1, 2, 3) ── -->
    <v-divider class="mt-3" />
    <v-list-subheader>{{ t('settings.vuetorrent.general.torrent_adding.subheader') }}</v-list-subheader>

    <v-list-item>
      <v-row>
        <!-- Feature 1: Pre-download file picker toggle -->
        <v-col cols="12">
          <v-checkbox
            v-model="vueTorrentStore.showPredownloadPicker"
            hide-details
            :label="t('settings.vuetorrent.general.torrent_adding.show_picker')" />
          <div class="text-caption text-grey ml-10">
            {{ t('settings.vuetorrent.general.torrent_adding.show_picker_hint') }}
          </div>
        </v-col>

        <!-- Feature 2: Extension blocklist -->
        <v-col cols="12">
          <div class="text-body-2 mb-1">{{ t('settings.vuetorrent.general.torrent_adding.blocked_ext_label') }}</div>
          <div class="text-caption text-grey mb-2">
            {{ t('settings.vuetorrent.general.torrent_adding.blocked_ext_hint') }}
          </div>
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3 text-caption">
            {{ t('settings.vuetorrent.general.torrent_adding.blocked_ext_native_note') }}
            <div class="mt-2 text-grey">
              Note: The native feature has known upstream bugs where it's silently ignored for magnet links, RSS-added torrents, and WebUI-added torrents in some versions (see issues 
              <a href="https://github.com/qbittorrent/qBittorrent/issues/21508" target="_blank" class="text-decoration-underline">#21508</a>,
              <a href="https://github.com/qbittorrent/qBittorrent/issues/21624" target="_blank" class="text-decoration-underline">#21624</a>,
              <a href="https://github.com/qbittorrent/qBittorrent/issues/24235" target="_blank" class="text-decoration-underline">#24235</a>). 
              VueTorrent's own client-side filtering (which requires a tab to be open) remains the primary and reliable mechanism.
            </div>
            <div v-if="preferenceStore.preferences" class="mt-2">
              <v-btn v-if="!preferenceStore.preferences.excluded_file_names_enabled" size="small" color="primary" @click="enableNativeExclusion">Enable native exclusion</v-btn>
              <v-btn v-else size="small" color="error" variant="tonal" @click="disableNativeExclusion">Disable native exclusion</v-btn>
            </div>
          </v-alert>
          <!-- Chip list of current extensions -->
          <div class="d-flex flex-wrap ga-1 mb-2">
            <v-chip
              v-for="ext in vueTorrentStore.blockedExtensions"
              :key="ext"
              closable
              size="small"
              @click:close="removeExtension(ext)">
              {{ ext }}
            </v-chip>
          </div>
          <!-- Input to add a new extension -->
          <v-text-field
            v-model="extensionInput"
            density="compact"
            hide-details
            :placeholder="t('settings.vuetorrent.general.torrent_adding.blocked_ext_placeholder')"
            :label="t('settings.vuetorrent.general.torrent_adding.blocked_ext_add')"
            append-inner-icon="mdi-plus"
            @click:append-inner="addExtension"
            @keydown.enter.prevent="addExtension"
            @keydown.comma.prevent="addExtension" />
        </v-col>

        <!-- Feature 3: Keep-alive toggle -->
        <v-col cols="12">
          <v-checkbox
            v-model="vueTorrentStore.keepAliveEnabled"
            hide-details
            :label="t('settings.vuetorrent.general.torrent_adding.keep_alive')" />
          <div class="text-caption text-grey ml-10">
            {{ t('settings.vuetorrent.general.torrent_adding.keep_alive_hint') }}
          </div>
        </v-col>

        <!-- Feature 3: VueTorrent-side API key -->
        <v-col cols="12">
          <div class="text-body-2 mb-1">{{ t('settings.vuetorrent.general.torrent_adding.apiKey.label') }}</div>
          <div class="text-caption text-grey mb-2">
            {{ t('settings.vuetorrent.general.torrent_adding.apiKey.hint') }}
          </div>
          <v-text-field
            v-model="apiKeyInput"
            density="compact"
            hide-details
            :type="showApiKey ? 'text' : 'password'"
            autocomplete="off"
            :label="t('settings.vuetorrent.general.torrent_adding.apiKey.field')"
            :disabled="!isHttpsOrLocalhost">
            <template #append-inner>
              <v-icon
                :icon="showApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                class="cursor-pointer"
                @click="showApiKey = !showApiKey" />
            </template>
          </v-text-field>
          <div v-if="!isHttpsOrLocalhost" class="text-caption text-error mt-1">
            Setting an API key over a plaintext HTTP connection is unsafe and has been disabled. Access VueTorrent via HTTPS.
          </div>
          <div class="d-flex ga-2 mt-2">
            <v-btn size="small" variant="tonal" color="accent" prepend-icon="mdi-check" :disabled="!isHttpsOrLocalhost" @click="applyApiKey">
              {{ t('settings.vuetorrent.general.torrent_adding.apiKey.apply') }}
            </v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-content-copy" :disabled="!apiKeyInput" @click="copyApiKey">
              {{ t('common.copy') }}
            </v-btn>
            <v-btn size="small" variant="tonal" color="error" prepend-icon="mdi-delete" :disabled="!apiKeyInput" @click="apiKeyInput = ''; applyApiKey()">
              {{ t('common.delete') }}
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-list-item>

  </v-list>
</template>
