// @vitest-environment node
import axios from 'axios'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDefaultGetTimeout, DEFAULT_GET_TIMEOUT_MS } from '../src/services/qbit/requestTimeout'

describe('addDefaultGetTimeout', () => {
  let server: Server
  let baseURL: string

  beforeAll(async () => {
    // Behaves like a qBittorrent that is stuck: accepts the request and never answers /hang
    server = createServer((req, res) => {
      if (req.url === '/hang') return
      res.end('ok')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  function makeClient(timeoutMs: number) {
    const client = axios.create({ baseURL, adapter: 'http' })
    addDefaultGetTimeout(client, timeoutMs)
    return client
  }

  it('gives up on a GET that never completes instead of waiting forever', async () => {
    const started = Date.now()
    await expect(makeClient(150).get('/hang')).rejects.toMatchObject({ code: 'ECONNABORTED' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('still returns normal responses', async () => {
    expect((await makeClient(150).get('/fine')).data).toBe('ok')
  })

  it('does not time out downloads or writes', () => {
    const client = makeClient(150)
    const seen: Record<string, number | undefined> = {}
    client.interceptors.request.use(config => {
      seen[`${config.method} ${config.responseType ?? 'json'}`] = config.timeout
      throw new axios.Cancel('inspect only')
    })
    return Promise.allSettled([client.get('/x', { responseType: 'blob' }), client.post('/x', 'a=b')]).then(() => {
      expect(seen['get blob']).toBeFalsy()
      expect(seen['post json']).toBeFalsy()
    })
  })

  it('uses a sensible default', () => {
    expect(DEFAULT_GET_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
  })
})
