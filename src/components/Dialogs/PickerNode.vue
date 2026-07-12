<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { formatData, getFileIcon } from '@/helpers'
import { useVueTorrentStore } from '@/stores'
import { TreeNode } from '@/types/vuetorrent'

const props = defineProps<{
  node: TreeNode
  deselectedIds: Set<number>
}>()

const emit = defineEmits<{
  toggle: [ids: number[], wanted: boolean]
}>()

const folderColor = '#ffe476'

const { mobile } = useDisplay()
const vuetorrentStore = useVueTorrentStore()

const depth = computed(() => {
  if (props.node.fullName === '') return 0
  const effectiveDepth = props.node.fullName.split('/').length
  const depthStep = mobile.value ? 12 : 24
  return effectiveDepth * depthStep
})

/** Whether this node (or all its children) are currently wanted. */
const wanted = computed(() => {
  const ids = props.node.childrenIds
  if (ids.length === 0) return true
  return ids.some(id => !props.deselectedIds.has(id))
})

const allWanted = computed(() => {
  const ids = props.node.childrenIds
  if (ids.length === 0) return true
  return ids.every(id => !props.deselectedIds.has(id))
})

function toggle() {
  const ids = props.node.childrenIds
  emit('toggle', ids, !wanted.value)
}

function getSubtitle() {
  const size = formatData(props.node.size, vuetorrentStore.useBinarySize)
  if (props.node.type === 'folder') {
    const [folderCount, fileCount] = props.node.deepCount
    const parts: string[] = [size]
    if (folderCount > 1) parts.push(`${folderCount - 1} folder${folderCount - 1 !== 1 ? 's' : ''}`)
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount !== 1 ? 's' : ''}`)
    return parts.join(' | ')
  }
  return size
}
</script>

<template>
  <div
    class="d-flex flex-column py-2 pr-3"
    :style="`padding-left: ${depth}px`">
    <div class="d-flex align-center">
      <!-- Checkbox -->
      <div class="d-flex align-center cursor-pointer" @click.stop="toggle">
        <v-icon v-if="allWanted" color="accent" icon="mdi-checkbox-marked" />
        <v-icon v-else-if="wanted" color="accent" icon="mdi-checkbox-intermediate-variant" />
        <v-icon v-else icon="mdi-checkbox-blank-outline" />
      </div>

      <!-- Folder icon -->
      <div v-if="node.type === 'folder'" class="d-flex align-center ml-2">
        <v-icon v-if="node.fullName === ''" icon="mdi-file-tree" />
        <v-icon v-else icon="mdi-folder" :color="folderColor" />
      </div>
      <!-- File icon -->
      <div v-else class="d-flex align-center ml-2">
        <v-icon :icon="getFileIcon(node.name)" />
      </div>

      <!-- Name + subtitle -->
      <div class="d-flex flex-column overflow-hidden text-no-wrap ml-3">
        <div>{{ node.name }}</div>
        <div class="text-grey text-caption">{{ getSubtitle() }}</div>
      </div>
    </div>
  </div>
</template>
