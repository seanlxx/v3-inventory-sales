import type {
  AuthProfile,
  AuthProfileResponse,
  AuthResponse,
  AuthSession,
  LoginPayload,
  UpdateAuthPayload
} from '~/types/auth'
import { clearStoredAiSessionKey } from '~/composables/useAiSessionKey'

const AUTH_STORAGE_KEY = 'vendingAuthSession'

function normalizeSession(response: AuthResponse): AuthSession {
  return {
    token: response.token,
    username: response.username,
    expiresAt: response.expires_at,
    usesDefaultPassword: response.uses_default_password
  }
}

function normalizeProfile(response: AuthProfileResponse): AuthProfile {
  return {
    username: response.username,
    usesDefaultPassword: response.uses_default_password
  }
}

function readStoredSession(): AuthSession | null {
  if (!import.meta.client) return null
  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      clearStoredAiSessionKey()
      return null
    }
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed.token || !parsed.expiresAt) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
      clearStoredAiSessionKey()
      return null
    }
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
      clearStoredAiSessionKey()
      return null
    }
    return parsed
  } catch {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    clearStoredAiSessionKey()
    return null
  }
}

function writeStoredSession(session: AuthSession | null) {
  if (!import.meta.client) return
  if (!session) {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    clearStoredAiSessionKey()
    return
  }
  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export const useAuthStore = defineStore('auth', () => {
  const session = shallowRef<AuthSession | null>(null)
  const profile = shallowRef<AuthProfile | null>(null)
  const initialized = shallowRef(false)
  const status = shallowRef<'idle' | 'pending' | 'success' | 'error'>('idle')
  const errorMessage = shallowRef('')

  const isAuthenticated = computed(() => {
    if (!session.value?.token || !session.value.expiresAt) return false
    return Date.parse(session.value.expiresAt) > Date.now()
  })

  const token = computed(() => session.value?.token ?? '')
  const username = computed(() => profile.value?.username ?? session.value?.username ?? '')
  const usesDefaultPassword = computed(() =>
    profile.value?.usesDefaultPassword ?? session.value?.usesDefaultPassword ?? false
  )

  function initialize() {
    if (initialized.value) return
    session.value = readStoredSession()
    initialized.value = true
  }

  function setSession(nextSession: AuthSession | null) {
    session.value = nextSession
    if (!nextSession) profile.value = null
    clearStoredAiSessionKey()
    writeStoredSession(nextSession)
  }

  function handleUnauthorized() {
    setSession(null)
    errorMessage.value = '登录已过期，请重新登录'
  }

  async function login(payload: LoginPayload) {
    const { request } = useApi()
    status.value = 'pending'
    errorMessage.value = ''
    try {
      const response = await request<AuthResponse | null, LoginPayload>('/auth/login', {
        method: 'POST',
        body: payload,
        skipAuth: true
      })
      if (!response) {
        throw {
          code: 'BAD_REQUEST',
          status: 400,
          message: '账号或密码错误'
        }
      }
      const nextSession = normalizeSession(response)
      setSession(nextSession)
      profile.value = {
        username: nextSession.username,
        usesDefaultPassword: nextSession.usesDefaultPassword
      }
      status.value = 'success'
      return nextSession
    } catch (error) {
      const normalized = normalizeApiError(error)
      errorMessage.value = normalized.message
      status.value = 'error'
      throw normalized
    }
  }

  async function fetchProfile() {
    initialize()
    const { request } = useApi()
    status.value = 'pending'
    errorMessage.value = ''
    try {
      const response = await request<AuthProfileResponse>('/auth/profile')
      const nextProfile = normalizeProfile(response)
      profile.value = nextProfile
      status.value = 'success'
      return nextProfile
    } catch (error) {
      const normalized = normalizeApiError(error)
      errorMessage.value = normalized.message
      status.value = 'error'
      throw normalized
    }
  }

  async function updateAuth(payload: UpdateAuthPayload) {
    const { request } = useApi()
    status.value = 'pending'
    errorMessage.value = ''
    try {
      const response = await request<AuthResponse, UpdateAuthPayload>('/auth/update', {
        method: 'POST',
        body: payload
      })
      const nextSession = normalizeSession(response)
      setSession(nextSession)
      profile.value = {
        username: nextSession.username,
        usesDefaultPassword: nextSession.usesDefaultPassword
      }
      status.value = 'success'
      return nextSession
    } catch (error) {
      const normalized = normalizeApiError(error)
      errorMessage.value = normalized.message
      status.value = 'error'
      throw normalized
    }
  }

  function logout() {
    setSession(null)
    status.value = 'idle'
    errorMessage.value = ''
  }

  return {
    session,
    profile,
    initialized,
    status,
    errorMessage,
    isAuthenticated,
    token,
    username,
    usesDefaultPassword,
    initialize,
    setSession,
    handleUnauthorized,
    login,
    fetchProfile,
    updateAuth,
    logout
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
}
