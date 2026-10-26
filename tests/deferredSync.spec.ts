import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { useDeferredSync } from '../src/composables/DeferredSync'

describe('useDeferredSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the local value immediately and the source on a later tick', async () => {
    const source = ref(['a'])
    const local = useDeferredSync(source)

    local.value = ['a', 'b']
    await nextTick()
    expect(local.value).toEqual(['a', 'b'])
    expect(source.value).toEqual(['a'])

    await vi.runAllTimersAsync()
    expect(source.value).toEqual(['a', 'b'])
  })

  it('follows changes made directly to the source', async () => {
    const source = ref(['a'])
    const local = useDeferredSync(source)

    source.value = ['z']
    await nextTick()
    expect(local.value).toEqual(['z'])
  })

  it('settles after several quick edits made before the first timer fires (used to flip forever)', async () => {
    const source = ref(['a'])
    const local = useDeferredSync(source)
    let sourceWrites = 0
    watch(source, () => sourceWrites++)

    for (const edit of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
      local.value = edit
      await nextTick()
    }
    // With the old stale-capture logic this never reaches a quiet state and runAllTimers gives up after 10 000 timers
    await vi.runAllTimersAsync()
    await nextTick()

    expect(source.value).toEqual(['a', 'b', 'c', 'd'])
    expect(local.value).toEqual(['a', 'b', 'c', 'd'])
    expect(vi.getTimerCount()).toBe(0)
    expect(sourceWrites).toBeLessThanOrEqual(2)
  })
})
