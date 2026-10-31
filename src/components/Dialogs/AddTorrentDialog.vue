<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { computed, h, onBeforeMount, ref } from 'vue'
import { useTheme } from 'vuetify'
import { toast } from 'vue3-toastify'
import AddTorrentParamsForm from './AddTorrentParamsForm.vue'
import HistoryField from '@/components/Core/HistoryField.vue'
import { useDialog, useI18nUtils } from '@/composables'
import { StopCondition } from '@/constants/qbit/AppPreferences'
import { HistoryKey } from '@/constants/vuetorrent'
import qbit from '@/services/qbit'
import { useAddTorrentStore, useAppStore, useDialogStore, useTorrentStore, useVueTorrentStore } from '@/stores'
import { getBlockedFileIds } from '@/stores/addTorrents'
import { AddTorrentPayload } from '@/types/qbit/payloads'
import { describeAddError } from '@/utils/addTorrentError'
import { splitKnownTorrents } from '@/utils/torrentInfo'

const props = withDefaults(
  defineProps<{
    guid: string
    openSuddenly?: boolean
  }>(),
  {
    openSuddenly: false,
  }
)

const { isOpened } = useDialog(props.guid)
const { t } = useI18nUtils()
const addTorrentStore = useAddTorrentStore()
const { urls, files, form, addTorrentParams } = storeToRefs(addTorrentStore)
const appStore = useAppStore()
const dialogStore = useDialogStore()
const torrentStore = useTorrentStore()
const vueTorrentStore = useVueTorrentStore()
const vuetifyTheme = useTheme()

const fileOverflowDisplayLimit = 2

const isFormValid = computed(() => urls.value.length > 0 || files.value.length > 0)

const cookieField = ref<typeof HistoryField>()
const addTorrentParamsForm = ref<typeof AddTorrentParamsForm>()

const cookie = computed({
  get: () => form.value.cookie,
  set: value => (form.value.cookie = value || undefined),
})

const rename = computed({
  get: () => form.value.rename,
  set: value => (form.value.rename = value || undefined),
})

/** Specific text for why adding failed (bad file, session expired...), instead of one vague error for everything */
function addErrorText(error: unknown) {
  const { key, params } = describeAddError(error)
  return params ? t(key, params) : t(key)
}

function addedAlreadyText(alreadyAdded: { name: string }[]) {
  return alreadyAdded.length === 1 ? t('toast.add.already_exists', { name: alreadyAdded[0].name }) : t('toast.add.already_exists_many', { n: alreadyAdded.length })
}

/** Options for the "already in qBittorrent" toast: one line that widens up to a third of the screen, ellipsis + full name on hover, themed */
function addedAlreadyToast(alreadyAdded: { name: string }[]) {
  const text = addedAlreadyText(alreadyAdded)
  return {
    render: () => h('div', { title: text, style: { maxWidth: 'calc(max(33vw, 320px) - 70px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text),
    type: 'default' as const,
    theme: vuetifyTheme.current.value.dark ? ('dark' as const) : ('light' as const),
    hideProgressBar: true,
    toastStyle: { borderLeft: '5px solid #14b8a6' },
  }
}

function finishAdding() {
  cookieField.value?.saveValueToHistory()
  addTorrentParamsForm.value?.saveFields()
  addTorrentStore.resetForm()
  close()
}

async function submit() {
  if (!isFormValid.value) return

  const payload: AddTorrentPayload = {
    addToTopOfQueue: addTorrentParams.value.add_to_top_of_queue,
    autoTMM: addTorrentParams.value.use_auto_tmm,
    category: addTorrentParams.value.category,
    contentLayout: addTorrentParams.value.content_layout,
    cookie: form.value.cookie,
    dlLimit: addTorrentParams.value.download_limit,
    downloadPath: addTorrentParams.value.download_path,
    firstLastPiecePrio: form.value.firstLastPiecePrio,
    forced: addTorrentParams.value.forced,
    inactiveSeedingTimeLimit: addTorrentParams.value.inactive_seeding_time_limit,
    paused: addTorrentParams.value.stopped,
    stopped: addTorrentParams.value.stopped,
    ratioLimit: addTorrentParams.value.ratio_limit,
    rename: form.value.rename,
    savepath: addTorrentParams.value.save_path,
    seedingTimeLimit: addTorrentParams.value.seeding_time_limit,
    sequentialDownload: form.value.sequentialDownload,
    skip_checking: addTorrentParams.value.skip_checking,
    stopCondition: addTorrentParams.value.stop_condition,
    tags: addTorrentParams.value.tags?.join(','),
    upLimit: addTorrentParams.value.upload_limit,
    useDownloadPath: addTorrentParams.value.use_download_path,
  }

  const torrentFiles = files.value
  const torrentUrls = urls.value
  const torrentsCount = torrentFiles.length + torrentUrls.split('\n').filter(url => url.trim().length).length

  // Which of these does qBittorrent already have? Still sent (it merges any new trackers into the existing torrent),
  // but then it can be explained as such, rather than as a vague error
  const known = await splitKnownTorrents(torrentFiles, torrentUrls, torrentStore.torrents)
  const everythingAlreadyAdded = known.alreadyAdded.length > 0 && known.alreadyAdded.length === torrentsCount

  // ── Feature 1: Show pre-download file picker ──────────────────────────────
  if (vueTorrentStore.showPredownloadPicker && torrentsCount === 1) {
    // Detect if source is a magnet/URL (needs metadata poll) or .torrent file
    const isMagnet = torrentFiles.length === 0

    let hashOrNull: string | null
    try {
      hashOrNull = await addTorrentStore.addTorrentStopped(torrentFiles, torrentUrls, payload)
    } catch (error) {
      if (everythingAlreadyAdded) toast(addedAlreadyToast(known.alreadyAdded).render, { ...addedAlreadyToast(known.alreadyAdded), autoClose: 4000 })
      else toast.error(addErrorText(error))
      return
    }
    if (!hashOrNull) {
      toast.error(t('toast.add.error', torrentsCount))
      return
    }

    if (!isMagnet) {
      const torrentFilesList = await qbit.getTorrentFiles(hashOrNull)
      const blockedIds = getBlockedFileIds(torrentFilesList, vueTorrentStore.allBlockedExtensions)
      if (vueTorrentStore.skipPickerForSingleFile && torrentFilesList.length <= 1) {
        if (blockedIds.length === 1) {
          await qbit.deleteTorrents([hashOrNull], true)
          const { default: SingleFileSkippedDialog } = await import('@/components/Dialogs/SingleFileSkippedDialog.vue')
          dialogStore.createDialog(SingleFileSkippedDialog, { filename: torrentFilesList[0].name })
          cookieField.value?.saveValueToHistory()
          addTorrentParamsForm.value?.saveFields()
          addTorrentStore.resetForm()
          close()
          return
        } else if (blockedIds.length === 0) {
          await qbit.removeTorrentTag([hashOrNull], ['vt-predownload'])
          await addTorrentStore.resumeTorrent(hashOrNull)

          cookieField.value?.saveValueToHistory()
          addTorrentParamsForm.value?.saveFields()
          addTorrentStore.resetForm()
          close()
          return
        }
      }
    }

    const { default: PredownloadFilesDialog } = await import('@/components/Dialogs/PredownloadFilesDialog.vue')
    dialogStore.createDialog(PredownloadFilesDialog, {
      hash: hashOrNull,
      torrentName: form.value.rename ?? '',
      payload,
      isMagnet,
    })

    cookieField.value?.saveValueToHistory()
    addTorrentParamsForm.value?.saveFields()
    addTorrentStore.resetForm()
    close()
    return
  }

  // With file exclusions configured nothing special happens here: the torrent is added normally and the exclusions are
  // applied in the background once its metadata is in (see processExternalTorrentBlocklist). Waiting for that here
  // kept this dialog open for as long as the metadata took, which for a magnet with no reachable peers is forever.
  // ── Default: add normally ─────────────────────────────────────────────────
  // For batch adds when picker is enabled, clear the stop condition so magnets
  // don't pause after metadata. The background sync will apply the blocklist.
  const finalPayload = torrentsCount > 1 && vueTorrentStore.showPredownloadPicker ? { ...payload, stopCondition: StopCondition.NONE } : payload
  const toastId = toast.loading(t('toast.add.pending'))
  try {
    await torrentStore.addTorrents(torrentFiles, torrentUrls, finalPayload)
    toast.update(toastId, { render: t('toast.add.success', torrentsCount), type: 'success', isLoading: false, autoClose: 1500 })
    finishAdding()
  } catch (error) {
    if (everythingAlreadyAdded && (error as { response?: { status?: number } })?.response?.status === 409) {
      // qBittorrent refuses a duplicate with a 409 (after merging any new trackers); that is not a failure worth a red error
      toast.update(toastId, { ...addedAlreadyToast(known.alreadyAdded), isLoading: false, autoClose: 4000 })
      finishAdding()
    } else {
      toast.update(toastId, { render: addErrorText(error), type: 'error', isLoading: false, autoClose: 5000 })
    }
  }
}

function close() {
  isOpened.value = false
}

onBeforeMount(() => {
  addTorrentStore.initForm()
})
</script>

<template>
  <v-dialog
    v-model="isOpened"
    :class="$vuetify.display.mobile ? '' : 'w-75'"
    :fullscreen="$vuetify.display.mobile"
    scrollable
    :transition="openSuddenly ? 'none' : 'dialog-bottom-transition'">
    <v-card>
      <v-card-title class="ios-margin">
        <v-toolbar color="transparent">
          <v-toolbar-title>{{ t('dialogs.add.title') }}</v-toolbar-title>
          <v-btn icon="mdi-close" @click="close" />
        </v-toolbar>
      </v-card-title>

      <v-card-text>
        <v-row>
          <v-col cols="12">
            <v-file-input
              v-model="files"
              :label="t('dialogs.add.files')"
              :show-size="vueTorrentStore.useBinarySize ? 1024 : 1000"
              accept=".torrent"
              counter
              multiple
              persistent-clear
              persistent-hint
              prepend-icon=""
              variant="outlined">
              <template #prepend>
                <v-icon color="accent"> mdi-paperclip </v-icon>
              </template>
              <template #selection="{ fileNames }">
                <template v-for="(filename, index) in fileNames">
                  <v-chip v-if="index < fileOverflowDisplayLimit" :key="filename" class="mr-2" color="accent" label size="small">
                    {{ filename }}
                  </v-chip>
                </template>
                <span v-if="fileNames.length > fileOverflowDisplayLimit" class="text-label-medium text-grey-darken-2 ml-2">
                  {{ t('dialogs.add.file_overflow', fileNames.length - fileOverflowDisplayLimit) }}
                </span>
              </template>
            </v-file-input>

            <v-textarea v-model="urls" :label="t('dialogs.add.links')" clearable>
              <template #prepend>
                <v-icon color="accent"> mdi-link </v-icon>
              </template>
            </v-textarea>

            <v-slide-y-transition>
              <HistoryField
                v-if="!!urls && !appStore.isFeatureAvailable('5.1.0')"
                ref="cookieField"
                v-model="cookie"
                :history-key="HistoryKey.COOKIE"
                clearable
                :label="$t('dialogs.add.cookie')"
                :placeholder="$t('dialogs.add.cookie_placeholder')">
                <template #prepend>
                  <v-icon color="accent"> mdi-cookie </v-icon>
                </template>
              </HistoryField>
            </v-slide-y-transition>

            <v-text-field v-model="rename" clearable hide-details :label="$t('dialogs.add.rename')">
              <template #prepend>
                <v-icon color="accent"> mdi-rename </v-icon>
              </template>
            </v-text-field>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" md="6">
            <v-checkbox v-model="form.sequentialDownload" :label="t('dialogs.add.sequential_download')" color="accent" density="compact" hide-details />
          </v-col>
          <v-col cols="12" md="6">
            <v-checkbox v-model="form.firstLastPiecePrio" :label="t('dialogs.add.first_last_piece_prio')" color="accent" density="compact" hide-details />
          </v-col>
        </v-row>

        <AddTorrentParamsForm ref="addTorrentParamsForm" v-model="addTorrentParams" />
      </v-card-text>

      <v-card-actions class="mb-2">
        <v-btn :text="$t('dialogs.add.reset_form')" color="error" variant="flat" @click="addTorrentStore.resetForm()" />
        <v-spacer />
        <v-btn :disabled="!isFormValid" :text="$t('dialogs.add.submit')" color="accent" type="submit" variant="elevated" @click="submit" />
        <v-btn :text="$t('common.close')" color="" variant="flat" @click="close" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
