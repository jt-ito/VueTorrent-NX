export type AddErrorMessage = { key: string; params?: Record<string, unknown> }

type RequestError = { code?: string; response?: { status?: number } }

/** Picks the most helpful text for a failed "add torrent" request, instead of one vague error for everything */
export function describeAddError(error: unknown): AddErrorMessage {
  const { code, response } = (error ?? {}) as RequestError
  const status = response?.status

  if (status === 409) return { key: 'toast.add.error_refused' }
  if (status === 415) return { key: 'toast.add.error_invalid_file' }
  if (status === 401 || status === 403) return { key: 'toast.add.error_session' }
  if (!status && (code === 'ECONNABORTED' || code === 'ERR_NETWORK')) return { key: 'toast.add.error_unreachable' }
  if (status && status >= 500) return { key: 'toast.add.error_server', params: { status } }
  if (status) return { key: 'toast.add.error_http', params: { status } }
  return { key: 'toast.add.error' }
}
