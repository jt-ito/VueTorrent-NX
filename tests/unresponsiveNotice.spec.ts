import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnresponsiveNotice } from '../src/composables/UnresponsiveNotice'

describe('createUnresponsiveNotice', () => {
  let clock = 0
  const onUnresponsive = vi.fn()
  const onRecovered = vi.fn()
  const make = () => createUnresponsiveNotice({ onUnresponsive, onRecovered, slowAfterMs: 8000, now: () => clock })

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 0
    onUnresponsive.mockClear()
    onRecovered.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays quiet while requests succeed quickly', () => {
    const notice = make()
    notice.begin().succeed()
    vi.advanceTimersByTime(20000)

    expect(onUnresponsive).not.toHaveBeenCalled()
    expect(onRecovered).not.toHaveBeenCalled()
  })

  it('speaks up when a request is still waiting after the slow limit, before it times out', () => {
    const notice = make()
    notice.begin()
    vi.advanceTimersByTime(7999)
    expect(onUnresponsive).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onUnresponsive).toHaveBeenCalledTimes(1)
    expect(onUnresponsive).toHaveBeenCalledWith(true)
    expect(notice.isDown()).toBe(true)
  })

  it('reports a failure straight away, and repeats are not marked as first', () => {
    const notice = make()
    notice.begin().fail()
    notice.begin().fail()

    expect(onUnresponsive.mock.calls).toEqual([[true], [false]])
  })

  it('reports recovery once, with how long it was down, and then goes quiet', () => {
    const notice = make()
    notice.begin().fail()
    clock = 42000
    notice.begin().succeed()
    notice.begin().succeed()

    expect(onRecovered).toHaveBeenCalledTimes(1)
    expect(onRecovered).toHaveBeenCalledWith(42000)
    expect(notice.isDown()).toBe(false)
  })

  it('a request that ends with a cancel does not count as an outage', () => {
    const notice = make()
    notice.begin().cancel()
    vi.advanceTimersByTime(20000)

    expect(onUnresponsive).not.toHaveBeenCalled()
  })

  it('a slow request that then succeeds counts as recovered', () => {
    const notice = make()
    const poll = notice.begin()
    vi.advanceTimersByTime(9000)
    clock = 9000
    poll.succeed()

    expect(onUnresponsive).toHaveBeenCalledTimes(1)
    expect(onRecovered).toHaveBeenCalledWith(9000)
  })
})
