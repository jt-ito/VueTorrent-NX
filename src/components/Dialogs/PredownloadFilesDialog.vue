<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef } from 'vue'
import PickerNode from './PickerNode.vue'
import { useDialog, useI18nUtils } from '@/composables'
import { useTreeBuilder } from '@/composables'
import { FilePriority } from '@/constants/qbit'
import qbit from '@/services/qbit'
import { useAddTorrentStore, useVueTorrentStore } from '@/stores'
import { TorrentFile } from '@/types/qbit/models'
import { AddTorrentPayload } from '@/types/qbit/payloads'
import { TreeNode } from '@/types/vuetorrent'
import { getBlockedFileIds } from '@/stores/addTorrents'

const props = withDefaults(
  defineProps<{
    guid: string
    hash: string
    torrentName: string
    payload: AddTorrentPayload
    isMagnet: boolean
    openSuddenly?: boolean
  }>(),
  { openSuddenly: false }
)

const { isOpened } = useDialog(props.guid)
const { t } = useI18nUtils()
const addTorrentStore = useAddTorrentStore()
const vuetorrentStore = useVueTorrentStore()

// ─── State machine ───────────────────────────────────────────────────────────
type Step = 'waiting_metadata' | 'picking' | 'applying' | 'done' | 'error' | 'timeout'

const step = ref<Step>(props.isMagnet ? 'waiting_metadata' : 'picking')
const errorMessage = ref('')
const elapsedMs = ref(0)
const cancelRef = ref(false)

// ─── File tree ───────────────────────────────────────────────────────────────
const files = shallowRef<TorrentFile[]>([])
const openedItems = shallowRef(new Set(['']))
const { flatTree } = useTreeBuilder(files, openedItems)

// IDs that the user has de-selected (starts pre-populated by extension blocklist)
const deselectedIds = shallowRef<Set<number>>(new Set())

// Toggle handler from PickerNode
function onToggle(ids: number[], wanted: boolean) {
  if (wanted) {
    ids.forEach(id => deselectedIds.value.delete(id))
  } else {
    ids.forEach(id => deselectedIds.value.add(id))
  }
  triggerRef(deselectedIds)
}

function selectAll() {
  deselectedIds.value = new Set()
  triggerRef(deselectedIds)
}

function selectNone() {
  deselectedIds.value = new Set(files.value.map(f => f.index))
  triggerRef(deselectedIds)
}

const selectedCount = computed(() => files.value.filter(f => !deselectedIds.value.has(f.index)).length)
const totalCount = computed(() => files.value.length)

// ─── Flatten all folders open initially ──────────────────────────────────────
function expandAll() {
  openedItems.value = files.value
    .flatMap(file =>
      file.name
        .replaceAll('\\', '/')
        .split('/')
        .reduce((prev, curr, i, arr) => [...prev, ...(i < arr.length - 1 ? [[...prev, curr].join('/')] : [])], [] as string[])
    )
    .reduce((prev, curr) => prev.add(curr), new Set(['']))
  triggerRef(openedItems)
}

// ─── Fetch files and pre-apply blocklist ─────────────────────────────────────
async function loadFiles() {
  addTorrentStore.pendingPickerHashes.add(props.hash)
  const torrentFiles = await qbit.getTorrentFiles(props.hash)
  files.value = torrentFiles
  // Pre-select blocklist-matching files as deselected
  const blockedIds = getBlockedFileIds(torrentFiles, vuetorrentStore.blockedExtensions)
  deselectedIds.value = new Set(blockedIds)
  triggerRef(deselectedIds)
  expandAll()

  // Skip picker if it's a single file and not blocked
  if (torrentFiles.length <= 1 && blockedIds.length === 0) {
    void confirm()
    return
  }

  step.value = 'picking'
}

// ─── Metadata polling (magnets only) ─────────────────────────────────────────
async function pollMetadata() {
  const ok = await addTorrentStore.waitForMetadata(
    props.hash,
    cancelRef as { value: boolean },
    elapsed => {
      elapsedMs.value = elapsed
    }
  )
  if (cancelRef.value) return // user cancelled
  if (!ok) {
    step.value = 'timeout'
    return
  }
  await loadFiles()
}

// ─── Confirm: apply priorities then resume ───────────────────────────────────
async function confirm() {
  step.value = 'applying'
  try {
    const ids = Array.from(deselectedIds.value)
    if (ids.length > 0) {
      await qbit.setTorrentFilePriority(props.hash, ids, FilePriority.DO_NOT_DOWNLOAD)
    }
    // Remove the cleanup tag before resuming
    await qbit.removeTorrentTag([props.hash], ['vt-predownload'])
    await addTorrentStore.resumeTorrent(props.hash)
    step.value = 'done'
  } catch (e: any) {
    errorMessage.value = e?.message ?? String(e)
    step.value = 'error'
  }
  close()
}

// ─── Cancel / timeout / error: delete the orphan torrent ─────────────────────
async function abort() {
  cancelRef.value = true
  try {
    await qbit.deleteTorrents([props.hash], false)
  } catch {
    // best-effort cleanup
  }
  close()
}

function close() {
  addTorrentStore.pendingPickerHashes.delete(props.hash)
  isOpened.value = false
}

const elapsedSeconds = computed(() => Math.floor(elapsedMs.value / 1000))

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  if (props.isMagnet) {
    await pollMetadata()
  } else {
    // .torrent file: metadata already present, fetch files immediately
    try {
      await loadFiles()
    } catch (e: any) {
      errorMessage.value = e?.message ?? String(e)
      step.value = 'error'
    }
  }
})

onBeforeUnmount(() => {
  cancelRef.value = true
})
</script>

<template>
  <v-dialog
    v-model="isOpened"
    :class="$vuetify.display.mobile ? '' : 'w-75'"
    :fullscreen="$vuetify.display.mobile"
    scrollable
    :transition="openSuddenly ? 'none' : 'dialog-bottom-transition'"
    persistent>
    <v-card>
      <v-card-title class="ios-margin">
        <v-toolbar color="transparent">
          <v-toolbar-title>{{ t('dialogs.predownload.title') }}</v-toolbar-title>
          <v-toolbar-subtitle v-if="torrentName" class="text-grey">{{ torrentName }}</v-toolbar-subtitle>
        </v-toolbar>
      </v-card-title>

      <v-card-text>
        <!-- ── Waiting for metadata ── -->
        <div v-if="step === 'waiting_metadata'" class="d-flex flex-column align-center pa-8 ga-4">
          <v-progress-circular indeterminate color="accent" size="64" />
          <div class="text-h6">{{ t('dialogs.predownload.fetching_metadata') }}</div>
          <div class="text-grey">{{ t('dialogs.predownload.elapsed', { s: elapsedSeconds }) }}</div>
          <div class="text-caption text-grey">{{ t('dialogs.predownload.fetching_hint') }}</div>
        </div>

        <!-- ── File picker ── -->
        <div v-else-if="step === 'picking'">
          <!-- Toolbar: select-all / select-none + summary -->
          <div class="d-flex align-center flex-wrap ga-2 mb-3">
            <v-btn size="small" variant="tonal" color="accent" prepend-icon="mdi-check-all" @click="selectAll">
              {{ t('common.selectAll') }}
            </v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-close-box-multiple" @click="selectNone">
              {{ t('common.selectNone') }}
            </v-btn>
            <v-spacer />
            <div class="text-caption text-grey">
              {{ t('dialogs.predownload.selection_summary', { selected: selectedCount, total: totalCount }) }}
            </div>
          </div>

          <!-- File tree -->
          <v-virtual-scroll :items="flatTree" item-height="60" max-height="420">
            <template #default="{ item }">
              <PickerNode :node="(item as TreeNode)" :deselected-ids="deselectedIds" @toggle="onToggle" />
            </template>
          </v-virtual-scroll>
        </div>

        <!-- ── Applying priorities ── -->
        <div v-else-if="step === 'applying'" class="d-flex flex-column align-center pa-8 ga-4">
          <v-progress-circular indeterminate color="accent" size="48" />
          <div>{{ t('dialogs.predownload.applying') }}</div>
        </div>

        <!-- ── Timeout ── -->
        <div v-else-if="step === 'timeout'" class="d-flex flex-column align-center pa-8 ga-4">
          <v-icon icon="mdi-clock-alert" size="48" color="warning" />
          <div class="text-h6">{{ t('dialogs.predownload.timeout_title') }}</div>
          <div class="text-grey">{{ t('dialogs.predownload.timeout_body') }}</div>
        </div>

        <!-- ── Error ── -->
        <div v-else-if="step === 'error'" class="d-flex flex-column align-center pa-8 ga-4">
          <v-icon icon="mdi-alert-circle" size="48" color="error" />
          <div class="text-h6">{{ t('dialogs.predownload.error_title') }}</div>
          <div class="text-grey text-caption">{{ errorMessage }}</div>
        </div>
      </v-card-text>

      <v-card-actions class="mb-2">
        <!-- Waiting: only cancel -->
        <template v-if="step === 'waiting_metadata'">
          <v-spacer />
          <v-btn color="error" variant="tonal" :text="t('common.cancel')" @click="abort" />
        </template>

        <!-- Picking: confirm + cancel -->
        <template v-else-if="step === 'picking'">
          <v-btn color="error" variant="tonal" :text="t('common.cancel')" @click="abort" />
          <v-spacer />
          <div v-if="selectedCount === 0" class="text-caption text-error mr-3">
            Must select at least 1 file
          </div>
          <v-btn color="accent" variant="elevated" :text="t('dialogs.predownload.confirm')" :disabled="selectedCount === 0" @click="confirm" />
        </template>

        <!-- Timeout/error: abort to delete orphan -->
        <template v-else-if="step === 'timeout' || step === 'error'">
          <v-spacer />
          <v-btn color="error" variant="tonal" :text="t('dialogs.predownload.discard')" @click="abort" />
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
