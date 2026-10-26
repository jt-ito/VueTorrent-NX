import { Ref, ref, watch } from 'vue'

/**
 * A local copy of `source` that updates immediately, while the write to `source` (which may trigger expensive work,
 * like re-sorting every torrent) is deferred to a later tick.
 *
 * Only the *latest* local value is ever written back, and `source` can't overwrite local edits that are still pending.
 * Copying a value captured earlier instead makes two quick edits undo each other forever.
 */
export function useDeferredSync<T>(source: Ref<T>): Ref<T> {
  const local = ref(source.value) as Ref<T>
  let isWritePending = false

  watch(source, value => {
    if (!isWritePending) local.value = value
  })

  watch(local, () => {
    if (isWritePending) return
    isWritePending = true
    setTimeout(() => {
      isWritePending = false
      if (source.value !== local.value) source.value = local.value
    })
  })

  return local
}
