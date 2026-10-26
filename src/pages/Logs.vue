<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue3-toastify'
import QbitLogs from '@/components/LogTabs/QbitLogs.vue'
import VueTorrentLogs from '@/components/LogTabs/VueTorrentLogs.vue'
import { useI18nUtils } from '@/composables'
import { downloadFile } from '@/helpers'
import { useAppLogStore, useLogStore } from '@/stores'

type LogTab = 'qbittorrent' | 'vuetorrent'

const router = useRouter()
const { t } = useI18nUtils()

const logStore = useLogStore()
const appLogStore = useAppLogStore()
const { reverseSort: qbitReverseSort } = storeToRefs(logStore)
const { reverseSort: appReverseSort } = storeToRefs(appLogStore)

// qBittorrent's logs come first and are what opens by default
const tab = ref<LogTab>('qbittorrent')
const reverseSort = computed({
  get: () => (tab.value === 'qbittorrent' ? qbitReverseSort.value : appReverseSort.value),
  set: value => {
    if (tab.value === 'qbittorrent') qbitReverseSort.value = value
    else appReverseSort.value = value
  },
})

// Title and tabs stay pinned; each tab pins its filters right below them (see .logs-tab-sticky)
const header = ref<HTMLElement>()
const { height: headerHeight } = useElementSize(header, undefined, { box: 'border-box' })

function goHome() {
  void router.push({ name: 'dashboard' })
}

async function copyAppLogs() {
  await navigator.clipboard.writeText(appLogStore.toText())
  toast.success(t('toast.copy.success'))
}

function downloadAppLogs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  downloadFile(`VueTorrent_logs_${stamp}.txt`, new Blob([appLogStore.toText()], { type: 'text/plain' }))
}

function handleKeyboardShortcut(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    goHome()
  }
}

onMounted(() => document.addEventListener('keydown', handleKeyboardShortcut))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeyboardShortcut))
</script>

<template>
  <div class="px-3 pb-3" :style="{ '--logs-header-h': `${headerHeight}px` }">
    <div ref="header" class="logs-sticky bg-background pt-3">
      <div class="d-flex align-center">
        <div class="text-headline-medium ml-2">
          {{ t('logs.pageTitle') }}
        </div>
        <v-spacer />
        <div class="d-flex justify-end">
          <template v-if="tab === 'vuetorrent'">
            <v-btn icon="mdi-content-copy" :title="t('logs.vueTorrent.copy')" variant="plain" @click="copyAppLogs" />
            <v-btn icon="mdi-download" :title="t('logs.vueTorrent.download')" variant="plain" @click="downloadAppLogs" />
            <v-btn icon="mdi-delete-sweep" :title="t('logs.vueTorrent.clear')" variant="plain" @click="appLogStore.clear()" />
          </template>
          <v-btn :icon="reverseSort ? 'mdi-sort-descending' : 'mdi-sort-ascending'" variant="plain" @click="reverseSort = !reverseSort" />
          <v-btn icon="mdi-close" variant="plain" @click="goHome" />
        </div>
      </div>

      <v-tabs v-model="tab" bg-color="primary" grow>
        <v-tab value="qbittorrent" :text="t('logs.tabs.qbittorrent')" />
        <v-tab value="vuetorrent" :text="t('logs.tabs.vuetorrent')" />
      </v-tabs>
    </div>

    <QbitLogs v-if="tab === 'qbittorrent'" />
    <VueTorrentLogs v-else />
  </div>
</template>

<style scoped>
.logs-sticky {
  position: sticky;
  top: var(--v-layout-top, 0px);
  z-index: 5;
}
</style>
