<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { toast } from 'vue3-toastify'
import EnhancedEdition from '@/components/Settings/addons/EnhancedEdition.vue'
import Advanced from '@/components/Settings/Advanced.vue'
import Behavior from '@/components/Settings/Behavior.vue'
import BitTorrent from '@/components/Settings/BitTorrent.vue'
import Connection from '@/components/Settings/Connection.vue'
import Downloads from '@/components/Settings/Downloads.vue'
import RSS from '@/components/Settings/RSS.vue'
import Speed from '@/components/Settings/Speed.vue'
import TagsAndCategories from '@/components/Settings/TagsAndCategories.vue'
import VGeneral from '@/components/Settings/VueTorrent/General.vue'
import VSidebar from '@/components/Settings/VueTorrent/Sidebar.vue'
import VTorrentCardGrid from '@/components/Settings/VueTorrent/TorrentCard/Grid.vue'
import VTorrentCardList from '@/components/Settings/VueTorrent/TorrentCard/List.vue'
import VTorrentCardTable from '@/components/Settings/VueTorrent/TorrentCard/Table.vue'
import WebUI from '@/components/Settings/WebUI.vue'
import { useI18nUtils } from '@/composables'
import { useAppLogStore, useAppStore, useDialogStore, usePreferenceStore, useVueTorrentStore } from '@/stores'

const router = useRouter()
const { t } = useI18nUtils()
const dialogStore = useDialogStore()
const preferenceStore = usePreferenceStore()
const appLogStore = useAppLogStore()
const appStore = useAppStore()
const vueTorrentStore = useVueTorrentStore()

// Title bar + main tabs stay pinned while scrolling; the VueTorrent sub-tabs stick just below them
const stickyHeader = ref<HTMLElement>()
const { height: stickyHeaderHeight } = useElementSize(stickyHeader, undefined, { box: 'border-box' })

const tabs = [
  { text: t('settings.tabs.vuetorrent.title'), value: 'vuetorrent' },
  { text: t('settings.tabs.behavior'), value: 'behavior' },
  { text: t('settings.tabs.downloads'), value: 'downloads' },
  { text: t('settings.tabs.connection'), value: 'connection' },
  { text: t('settings.tabs.speed'), value: 'speed' },
  { text: t('settings.tabs.bittorrent'), value: 'bittorrent' },
  { text: t('settings.tabs.rss'), value: 'rss' },
  { text: t('settings.tabs.webui'), value: 'webui' },
  { text: t('settings.tabs.tagsAndCategories'), value: 'tagsAndCategories' },
  { text: t('settings.tabs.advanced'), value: 'advanced' },
]

const tabsV = [
  { text: t('settings.tabs.vuetorrent.general'), value: 'general' },
  { text: t('settings.tabs.vuetorrent.torrent_card.list'), value: 'torrentCardList' },
  { text: t('settings.tabs.vuetorrent.torrent_card.grid'), value: 'torrentCardGrid' },
  { text: t('settings.tabs.vuetorrent.torrent_card.table'), value: 'torrentCardTable' },
  { text: t('settings.tabs.vuetorrent.sidebar'), value: 'sidebar' },
]

const tab = ref('vuetorrent')
const innerTabV = ref('general')

const isEnhancedEdition = computed(() => preferenceStore.preferences && Object.keys(preferenceStore.preferences).includes('public_trackers'))

async function saveSettings() {
  if (vueTorrentStore.hasUnsavedChanges) {
    vueTorrentStore.commitDraftBlockedExtensions()
  }
  const sentSettings = await preferenceStore.setPreferences()
  // Names only, never values: some settings are passwords or paths
  appLogStore.add(
    'info',
    'settings',
    sentSettings.length > 0 ? `Saved ${sentSettings.length} qBittorrent setting(s): ${sentSettings.join(', ')}` : 'Saved VueTorrent settings (nothing changed in qBittorrent)'
  )
  toast.success(t('settings.saveSuccess'))
  await preferenceStore.fetchPreferences()

  if (!preferenceStore.preferences!.alternative_webui_enabled) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        await registration.unregister()
      }
    }
    location.hash = ''
    location.reload()
  }
}

function confirmUnsavedChanges(onConfirm: () => void) {
  if (vueTorrentStore.hasUnsavedChanges) {
    dialogStore.confirmAction({
      title: t('dialogs.confirm.unsavedChanges') || 'Unsaved Changes',
      text: 'You have unsaved changes to your settings. Are you sure you want to discard them and leave?',
      yesText: 'Discard & Leave',
      yesColor: 'error',
      noText: 'Stay',
      onConfirm: () => {
        vueTorrentStore.revertDraftBlockedExtensions()
        onConfirm()
      },
    })
  } else {
    onConfirm()
  }
}

function goHome() {
  confirmUnsavedChanges(() => {
    void router.push({ name: 'dashboard' })
  })
}

onBeforeRouteLeave((_to, _from, next) => {
  // Being signed out sends you to the login page. Asking about unsaved changes there would trap you on a dead page,
  // and the edits are kept in memory anyway, so they are still there after signing back in.
  if (!appStore.isAuthenticated) {
    next()
    return
  }

  if (vueTorrentStore.hasUnsavedChanges) {
    dialogStore.confirmAction({
      title: 'Unsaved Changes',
      text: 'You have unsaved changes to your settings. Are you sure you want to discard them and leave?',
      yesText: 'Discard & Leave',
      yesColor: 'error',
      noText: 'Stay',
      onConfirm: () => {
        vueTorrentStore.revertDraftBlockedExtensions()
        next()
      },
      onCancel: () => {
        next(false)
      },
    })
  } else {
    next()
  }
})

function handleKeyboardShortcut(e: KeyboardEvent) {
  if (dialogStore.hasActiveDialog) {
    return false
  }

  if (e.key === 'Escape') {
    goHome()
  }
}

function updateTabHandle() {
  const tabRouteParam = router.currentRoute.value.params.tab as string
  const subtabRouteParam = router.currentRoute.value.params.subtab as string
  if (tabRouteParam) {
    if (tabRouteParam === 'vuetorrent' && subtabRouteParam) {
      innerTabV.value = subtabRouteParam
    }
    tab.value = tabRouteParam
  }
}

watchEffect(() => {
  updateTabHandle()
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyboardShortcut)
  updateTabHandle()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyboardShortcut)
})
</script>

<template>
  <div class="px-3 pb-3" :style="{ '--settings-sticky-h': `${stickyHeaderHeight}px` }">
    <div ref="stickyHeader" class="settings-sticky bg-background pt-3">
      <div class="d-flex align-center">
        <div class="text-headline-medium ml-2">
          {{ t('settings.title') }}
        </div>
        <v-spacer />
        <div class="d-flex justify-end">
          <v-badge :model-value="vueTorrentStore.hasUnsavedChanges" dot color="warning" class="mr-1">
            <v-btn color="accent" icon="mdi-content-save" variant="plain" @click="saveSettings" />
          </v-badge>
          <v-btn icon="mdi-close" variant="plain" @click="goHome" />
        </div>
      </div>

      <v-row class="ma-0 pa-0">
        <v-tabs v-model="tab" bg-color="primary" grow show-arrows>
          <v-tab
            v-if="isEnhancedEdition"
            value="enhancedEdition"
            :text="t('settings.tabs.addons.enhanced_edition')"
            replace
            :to="{ name: 'settings', params: { tab: 'enhancedEdition' } }" />
          <v-tab v-for="{ text, value } in tabs" :key="value" :value="value" :text="text" replace :to="{ name: 'settings', params: { tab: value } }" />
        </v-tabs>
      </v-row>
    </div>

    <v-window v-model="tab" class="settings-window" :touch="false">
      <v-window-item value="enhancedEdition" :transition="false" :reverse-transition="false">
        <EnhancedEdition />
      </v-window-item>

      <v-window-item value="vuetorrent" :transition="false" :reverse-transition="false">
        <v-tabs v-model="innerTabV" class="settings-sticky-sub" bg-color="surface" grow color="accent" show-arrows>
          <v-tab v-for="{ text, value } in tabsV" :key="value" :value="value" :text="text" replace :to="{ name: 'settings', params: { tab: 'vuetorrent', subtab: value } }" />
        </v-tabs>

        <v-window v-model="innerTabV" :touch="false">
          <v-window-item value="general" :transition="false" :reverse-transition="false">
            <VGeneral />
          </v-window-item>
          <v-window-item value="torrentCardList" :transition="false" :reverse-transition="false">
            <VTorrentCardList />
          </v-window-item>
          <v-window-item value="torrentCardGrid" :transition="false" :reverse-transition="false">
            <VTorrentCardGrid />
          </v-window-item>
          <v-window-item value="torrentCardTable" :transition="false" :reverse-transition="false">
            <VTorrentCardTable />
          </v-window-item>
          <v-window-item value="sidebar" :transition="false" :reverse-transition="false">
            <VSidebar />
          </v-window-item>
        </v-window>
      </v-window-item>

      <v-window-item value="behavior" :transition="false" :reverse-transition="false">
        <Behavior />
      </v-window-item>

      <v-window-item value="downloads" :transition="false" :reverse-transition="false">
        <Downloads />
      </v-window-item>

      <v-window-item value="connection" :transition="false" :reverse-transition="false">
        <Connection />
      </v-window-item>

      <v-window-item value="speed" :transition="false" :reverse-transition="false">
        <Speed />
      </v-window-item>

      <v-window-item value="bittorrent" :transition="false" :reverse-transition="false">
        <BitTorrent />
      </v-window-item>

      <v-window-item value="rss" :transition="false" :reverse-transition="false">
        <RSS />
      </v-window-item>

      <v-window-item value="webui" :transition="false" :reverse-transition="false">
        <WebUI />
      </v-window-item>

      <v-window-item value="tagsAndCategories" :transition="false" :reverse-transition="false">
        <TagsAndCategories />
      </v-window-item>

      <v-window-item value="advanced" :transition="false" :reverse-transition="false">
        <Advanced />
      </v-window-item>
    </v-window>
  </div>
</template>

<style scoped>
.settings-sticky {
  position: sticky;
  top: var(--v-layout-top, 0px);
  z-index: 5;
}

.settings-sticky-sub {
  position: sticky;
  top: calc(var(--v-layout-top, 0px) + var(--settings-sticky-h, 0px));
  z-index: 4;
}

/* 'clip' still hides slide transitions but, unlike 'hidden', doesn't become the scroll container that sticky children bind to */
.settings-window {
  overflow: clip;
}
</style>
