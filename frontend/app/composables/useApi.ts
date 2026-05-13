import type { ApiError, ApiErrorCode, ApiRequestBody, ApiRequestOptions, ApiRequestStatus } from '~/types/api'
import type { ComputedRef, Ref } from 'vue'

type RequestState = {
  status: Ref<ApiRequestStatus>
  loading: ComputedRef<boolean>
  error: Ref<ApiError | null>
  clearError: () => void
}

function statusCodeToErrorCode(status?: number): ApiErrorCode {
  if (status === 400) return 'BAD_REQUEST'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 429) return 'RATE_LIMITED'
  if (status && status >= 500) return 'SERVER_ERROR'
  return 'UNKNOWN_ERROR'
}

function extractErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.message === 'string' && record.message) return record.message
    if (typeof record.error === 'string' && record.error) return record.error
  }
  return fallback
}

export function normalizeApiError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as ApiError
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const fetchError = error as {
      response?: { status?: number; _data?: unknown }
      statusCode?: number
      statusMessage?: string
      message?: string
      data?: unknown
    }
    const status = fetchError.response?.status ?? fetchError.statusCode
    const details = fetchError.response?._data ?? fetchError.data
    return {
      code: statusCodeToErrorCode(status),
      status,
      message: extractErrorMessage(details, fetchError.statusMessage || fetchError.message || '请求失败'),
      details
    }
  }

  if (error && typeof error === 'object' && 'statusCode' in error) {
    const nuxtError = error as { statusCode?: number; statusMessage?: string; message?: string; data?: unknown }
    return {
      code: statusCodeToErrorCode(nuxtError.statusCode),
      status: nuxtError.statusCode,
      message: nuxtError.statusMessage || nuxtError.message || '请求失败',
      details: nuxtError.data
    }
  }

  if (error instanceof TypeError) {
    return {
      code: 'NETWORK_ERROR',
      message: '网络连接失败，请稍后重试'
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : '请求失败'
  }
}

function buildHeaders(options: ApiRequestOptions, token: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers
  }

  if (options.body !== undefined && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams)) {
    headers['Content-Type'] = 'application/json'
  }

  if (!options.skipAuth && token) {
    headers['X-VM-Session'] = token
  }

  return headers
}

function useApiState(): RequestState & { activeRequests: Ref<number> } {
  const requestStatus = useState<ApiRequestStatus>('api:status', () => 'idle')
  const requestError = useState<ApiError | null>('api:error', () => null)
  const activeRequests = useState<number>('api:activeRequests', () => 0)

  return {
    status: requestStatus,
    loading: computed(() => activeRequests.value > 0),
    error: requestError,
    activeRequests,
    clearError: () => {
      requestError.value = null
      if (activeRequests.value === 0) requestStatus.value = 'idle'
    }
  }
}

export function useApi() {
  const config = useRuntimeConfig()
  const state = useApiState()

  async function request<TResponse, TBody extends ApiRequestBody = Record<string, unknown>>(
    path: string,
    options: ApiRequestOptions<TBody> = {}
  ): Promise<TResponse> {
    const authStore = useAuthStore()
    const toastStore = useToastStore()
    authStore.initialize()

    const apiBase = String(config.public.apiBase || '/api').replace(/\/$/, '')
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    state.activeRequests.value += 1
    state.status.value = 'pending'
    state.error.value = null

    try {
      const response = await $fetch<TResponse>(`${apiBase}${normalizedPath}`, {
        method: options.method || 'GET',
        query: options.query,
        body: options.body,
        headers: buildHeaders(options, authStore.token)
      })
      state.status.value = 'success'
      return response
    } catch (error) {
      const normalized = normalizeApiError(error)
      state.error.value = normalized
      state.status.value = 'error'

      if (normalized.status === 401 || normalized.code === 'UNAUTHORIZED') {
        authStore.handleUnauthorized()
        toastStore.show('登录已过期，请重新登录', 'warning')
      } else {
        toastStore.show(normalized.message, 'danger')
      }

      throw normalized
    } finally {
      state.activeRequests.value = Math.max(0, state.activeRequests.value - 1)
      if (state.activeRequests.value === 0 && state.status.value === 'pending') {
        state.status.value = 'idle'
      }
    }
  }

  return {
    status: state.status,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
    request
  }
}
