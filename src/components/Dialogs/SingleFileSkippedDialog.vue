<script setup lang="ts">
import { useDialog } from '@/composables'

const props = defineProps<{
  guid: string
  filename: string
}>()

const { isOpened } = useDialog(props.guid)

function close() {
  isOpened.value = false
}
</script>

<template>
  <v-dialog v-model="isOpened" max-width="500">
    <v-card>
      <v-card-title>Torrent Skipped</v-card-title>
      <v-card-text>
        The torrent was skipped and deleted because it only contains a single file (<strong>{{ filename }}</strong>) with an extension that matches your exclusion list.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="accent" @click="close">{{ $t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped></style>
