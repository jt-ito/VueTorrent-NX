import { describe, expect, it } from 'vitest'
import { describeRequestProblem } from '../src/services/qbit/requestLog'

describe('describeRequestProblem', () => {
  it('describes a timeout with the method, path and limit', () => {
    const problem = describeRequestProblem({ code: 'ECONNABORTED', config: { method: 'get', url: '/sync/maindata', timeout: 20000 } })

    expect(problem?.level).toBe('warning')
    expect(problem?.message).toBe('GET /sync/maindata timed out after 20s (qBittorrent or the connection is not answering)')
  })

  it('describes server errors, network errors and refused sessions', () => {
    expect(describeRequestProblem({ response: { status: 502 }, config: { method: 'post', url: '/torrents/add' } })).toMatchObject({
      level: 'warning',
      message: 'POST /torrents/add returned 502',
    })
    expect(describeRequestProblem({ code: 'ERR_NETWORK', config: { method: 'get', url: '/app/version' } })?.message).toContain('network error')
    expect(describeRequestProblem({ response: { status: 403 }, config: { url: '/app/version' } })?.level).toBe('info')
  })

  it('ignores ordinary client errors like 404', () => {
    expect(describeRequestProblem({ response: { status: 404 }, config: { url: '/torrents/files' } })).toBeNull()
  })

  it('never includes request data in the message', () => {
    const error = { response: { status: 500 }, config: { method: 'post', url: '/auth/login', data: 'username=a&password=secret' } }
    const problem = describeRequestProblem(error as never)

    expect(problem?.message).not.toContain('secret')
  })
})
