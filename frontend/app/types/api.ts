export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export type ApiError = {
  code: ApiErrorCode
  message: string
  status?: number
  details?: unknown
}

export type ApiRequestStatus = 'idle' | 'pending' | 'success' | 'error'

export type ApiResult<T> = {
  data: T
  meta?: {
    bookmark?: string
    cursor?: string
    total?: number
  }
}

export type ApiRequestBody = Record<string, unknown> | unknown[] | FormData | URLSearchParams

export type ApiRequestOptions<TBody = ApiRequestBody> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | null | undefined>
  body?: TBody
  headers?: Record<string, string>
  skipAuth?: boolean
}
