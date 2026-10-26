<script setup lang="ts">
import { TinyColor } from '@ctrl/tinycolor'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18nUtils } from '@/composables'
import { useAppLogStore, useVueTorrentStore } from '@/stores'
import { APP_LOG_LEVELS, AppLog, AppLogLevel } from '@/stores/appLogs'

const { t } = useI18nUtils()
const { current: currentTheme } = useTheme()

const appLogStore = useAppLogStore()
const { filteredLogs, levelFilter, messageFilter, paginatedResults, currentPage, pageCount } = storeToRefs(appLogStore)
const vueTorrentStore = useVueTorrentStore()

const colors = {
  light: { info: new TinyColor('blue'), warning: new TinyColor('orange'), error: new TinyColor('red') },
  dark: { info: new TinyColor('deepskyblue'), warning: new TinyColor('darkorange'), error: new TinyColor('darkred').lighten(12) },
} satisfies Record<'light' | 'dark', Record<AppLogLevel, TinyColor>>

const levelOptions = computed(() => APP_LOG_LEVELS.map(level => ({ title: t(`logs.vueTorrent.levels.${level}`), value: level })))

const someLevelsSelected = computed(() => levelFilter.value.length > 0)
const allLevelsSelected = computed(() => levelFilter.value.length === APP_LOG_LEVELS.length)

function getLevelColor(log: AppLog) {
  return `color: #${colors[currentTheme.value.dark ? 'dark' : 'light'][log.level].toHex()}`
}

function formatTimestamp(log: AppLog) {
  return dayjs(log.timestamp * 1000).format(vueTorrentStore.dateFormat)
}

function toggleSelectAll() {
  levelFilter.value = allLevelsSelected.value ? [] : [...APP_LOG_LEVELS]
}
</script>

<template>
  <!-- Filters and top page selector stay pinned (below the page header) while the log rows scroll -->
  <div class="logs-tab-sticky bg-background">
    <v-list>
      <v-list-item>
        <v-row>
          <v-col cols="6">
            <v-select v-model="levelFilter" :items="levelOptions" :label="t('logs.filters.type')" chips hide-details multiple>
              <template #prepend-item>
                <v-list-item :title="t('common.selectAll')" @click="toggleSelectAll">
                  <template #prepend>
                    <v-checkbox-btn :indeterminate="someLevelsSelected && !allLevelsSelected" :model-value="someLevelsSelected" />
                  </template>
                </v-list-item>
                <v-divider />
              </template>
            </v-select>
          </v-col>

          <v-col cols="6">
            <v-text-field v-model="messageFilter" :label="t('logs.filters.query')" clearable hide-details />
          </v-col>
        </v-row>
      </v-list-item>

      <v-divider class="my-3" thickness="5" />

      <v-list-item v-if="pageCount > 1">
        <v-pagination v-model="currentPage" :length="pageCount" prev-icon="mdi-menu-left" next-icon="mdi-menu-right" />
      </v-list-item>

      <v-divider />
    </v-list>
  </div>

  <v-list>
    <template v-for="(log, index) in paginatedResults" :key="log.id">
      <v-divider v-if="index > 0" />

      <v-list-item class="pa-0">
        <v-expansion-panels class="p-0">
          <v-expansion-panel class="pa-0">
            <v-expansion-panel-title :style="getLevelColor(log)">
              <!-- On narrow screens the time goes under the message so the message gets the whole width -->
              <div class="d-flex flex-column flex-sm-row align-sm-center w-100 overflow-hidden mr-4">
                <div class="text-truncate flex-grow-1">
                  <span class="text-medium-emphasis mr-2">[{{ log.source }}]</span>
                  <span v-if="log.count > 1" class="font-weight-bold mr-2">x{{ log.count }}</span>
                  {{ log.message }}
                </div>
                <div class="text-no-wrap text-caption text-sm-body-1 ml-sm-4">
                  {{ formatTimestamp(log) }}
                </div>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text class="wrap-word text-select" :style="getLevelColor(log)">
              <div>[{{ t(`logs.vueTorrent.levels.${log.level}`) }}] [{{ log.source }}] {{ log.message }}</div>
              <div v-if="log.count > 1">{{ t('logs.vueTorrent.repeated', { n: log.count }) }}</div>
              <pre v-if="log.details" class="mt-2 details">{{ log.details }}</pre>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-list-item>
    </template>

    <v-list-item v-if="filteredLogs.length === 0">
      {{ t('logs.vueTorrent.empty') }}
    </v-list-item>

    <v-divider />

    <v-list-item v-if="pageCount > 1">
      <v-pagination v-model="currentPage" :length="pageCount" prev-icon="mdi-menu-left" next-icon="mdi-menu-right" />
    </v-list-item>
  </v-list>
</template>

<style scoped>
.details {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
  font-size: 0.8rem;
}
</style>
