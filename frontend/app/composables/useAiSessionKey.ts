const AI_SESSION_KEY_STORAGE_KEY = 'vendingAiSessionKey'

type StoredAiSessionKey = {
  token: string
  apiKey: string
}

function readStoredAiSessionKey(token: string) {
  if (!import.meta.client || !token) return ''
  try {
    const raw = window.sessionStorage.getItem(AI_SESSION_KEY_STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as StoredAiSessionKey
    if (parsed.token !== token || !parsed.apiKey) {
      window.sessionStorage.removeItem(AI_SESSION_KEY_STORAGE_KEY)
      return ''
    }
    return parsed.apiKey
  } catch {
    window.sessionStorage.removeItem(AI_SESSION_KEY_STORAGE_KEY)
    return ''
  }
}

function writeStoredAiSessionKey(token: string, apiKey: string) {
  if (!import.meta.client || !token) return
  window.sessionStorage.setItem(AI_SESSION_KEY_STORAGE_KEY, JSON.stringify({ token, apiKey }))
}

export function clearStoredAiSessionKey() {
  if (!import.meta.client) return
  window.sessionStorage.removeItem(AI_SESSION_KEY_STORAGE_KEY)
}

export function useAiSessionKey() {
  const authStore = useAuthStore()
  const apiKey = useState<string>('ai:sessionApiKey', () => '')

  const isConfigured = computed(() => apiKey.value.trim().length > 0)

  function sessionToken() {
    const token = authStore.token
    const expiresAt = authStore.session?.expiresAt
    if (!token || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
      clearApiKey()
      return ''
    }
    return token
  }

  function initialize() {
    authStore.initialize()
    const token = sessionToken()
    if (!token) {
      clearApiKey()
      return ''
    }
    apiKey.value = readStoredAiSessionKey(token)
    return apiKey.value
  }

  function saveApiKey(nextApiKey: string) {
    authStore.initialize()
    const trimmed = nextApiKey.trim()
    const token = sessionToken()
    if (!token || !trimmed) return false
    apiKey.value = trimmed
    writeStoredAiSessionKey(token, trimmed)
    return true
  }

  function getApiKey() {
    if (!apiKey.value) initialize()
    return apiKey.value.trim()
  }

  function clearApiKey() {
    apiKey.value = ''
    clearStoredAiSessionKey()
  }

  return {
    apiKey,
    isConfigured,
    initialize,
    saveApiKey,
    getApiKey,
    clearApiKey
  }
}
