import type { ApiError } from '~/types/api'
import type {
  SettingEntry,
  SettingsState
} from '~/types/settings'
import type { UpdateAuthPayload } from '~/types/auth'

const defaultMachines = ['1号机', '2号机']
const defaultCategories = ['饮料', '零食', '日用品', '烟酒', '其他']

function normalizeInteger(value: unknown, fallback: number, min: number) {
  const number = Math.round(Number(value))
  return Number.isFinite(number) && number >= min ? number : fallback
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function normalizeStringList(value: unknown, fallback: readonly string[]) {
  const parsed = parseMaybeJson(value)
  if (!Array.isArray(parsed)) return [...fallback]
  const unique = Array.from(new Set(parsed.map(item => String(item || '').trim()).filter(Boolean)))
  return unique.length ? unique : [...fallback]
}

function mapSettings(entries: SettingEntry[]): SettingsState {
  const byKey = new Map(entries.map(entry => [entry.key, entry.value]))
  return {
    machines: normalizeStringList(byKey.get('machines'), defaultMachines),
    categories: normalizeStringList(byKey.get('categories'), defaultCategories)
  }
}

export function useSettings() {
  const { request } = useApi()
  const toastStore = useToastStore()
  const authStore = useAuthStore()

  const settings = shallowRef<SettingsState>({
    machines: [...defaultMachines],
    categories: [...defaultCategories]
  })
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const accountSaving = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  async function loadSettings() {
    loading.value = true
    error.value = null
    try {
      const entries = await request<SettingEntry[]>('/settings')
      settings.value = mapSettings(entries)
      await authStore.fetchProfile().catch(() => null)
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveSetting<T>(key: string, value: T) {
    return await request<SettingEntry<T>, Record<string, unknown>>('/settings', {
      method: 'POST',
      body: { key, value }
    })
  }

  async function saveMachines(machines: string[]) {
    saving.value = true
    error.value = null
    try {
      const normalized = normalizeStringList(machines, defaultMachines)
      await saveSetting('machines', JSON.stringify(normalized))
      settings.value = { ...settings.value, machines: normalized }
      toastStore.show('售货机设置已保存', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function saveCategories(categories: string[]) {
    saving.value = true
    error.value = null
    try {
      const normalized = normalizeStringList(categories, defaultCategories)
      await saveSetting('categories', JSON.stringify(normalized))
      settings.value = { ...settings.value, categories: normalized }
      toastStore.show('分类设置已保存', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function updateAccount(payload: UpdateAuthPayload) {
    accountSaving.value = true
    error.value = null
    try {
      await authStore.updateAuth(payload)
      toastStore.show('账号设置已保存，请使用新会话继续操作', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      accountSaving.value = false
    }
  }

  return {
    settings,
    loading,
    saving,
    accountSaving,
    error,
    loadSettings,
    saveMachines,
    saveCategories,
    updateAccount
  }
}
