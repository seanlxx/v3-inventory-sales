import type { ApiError } from '~/types/api'
import type {
  AiClientConfigs,
  AiProviderId,
  AiProviderOption,
  BusinessSettings,
  SettingEntry,
  SettingsState
} from '~/types/settings'
import type { UpdateAuthPayload } from '~/types/auth'

const defaultBusinessSettings: BusinessSettings = {
  lowStockThreshold: 3,
  restockTargetDays: 7
}

const defaultMachines = ['1号机', '2号机']
const defaultCategories = ['饮料', '零食', '日用品', '烟酒', '其他']

export const aiProviderOptions: readonly AiProviderOption[] = [
  {
    id: 'opencode',
    label: 'OpenCode 中转',
    defaultBaseUrl: 'https://api.243706.xyz/v1',
    keyEnv: 'OPENCODE_API_KEY',
    baseUrlEnv: 'OPENCODE_BASE_URL'
  },
  {
    id: 'qwen',
    label: '通义千问',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyEnv: 'QWEN_API_KEY',
    baseUrlEnv: 'QWEN_BASE_URL'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL'
  },
  {
    id: 'claude',
    label: 'Claude',
    defaultBaseUrl: 'https://xcode.best/v1',
    keyEnv: 'CLAUDE_API_KEY',
    baseUrlEnv: 'CLAUDE_BASE_URL'
  },
  {
    id: 'yunwu',
    label: '云雾',
    defaultBaseUrl: 'https://yunwu.ai/v1',
    keyEnv: 'YUNWU_API_KEY',
    baseUrlEnv: 'YUNWU_BASE_URL'
  }
] as const

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

function normalizeBusinessSettings(entries: Map<string, unknown>): BusinessSettings {
  const bundled = parseMaybeJson(entries.get('businessSettings'))
  const objectValue = bundled && typeof bundled === 'object' && !Array.isArray(bundled)
    ? bundled as Partial<BusinessSettings>
    : {}

  return {
    lowStockThreshold: normalizeInteger(
      objectValue.lowStockThreshold ?? entries.get('lowStockThreshold'),
      defaultBusinessSettings.lowStockThreshold,
      0
    ),
    restockTargetDays: normalizeInteger(
      objectValue.restockTargetDays ?? entries.get('restockTargetDays'),
      defaultBusinessSettings.restockTargetDays,
      1
    )
  }
}

function normalizeAiClientConfigs(value: unknown): AiClientConfigs {
  const parsed = parseMaybeJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as AiClientConfigs
}

function normalizeAiProvider(value: unknown): AiProviderId {
  return aiProviderOptions.some(provider => provider.id === value) ? value as AiProviderId : 'qwen'
}

function mapSettings(entries: SettingEntry[]): SettingsState {
  const byKey = new Map(entries.map(entry => [entry.key, entry.value]))
  return {
    businessSettings: normalizeBusinessSettings(byKey),
    machines: normalizeStringList(byKey.get('machines'), defaultMachines),
    categories: normalizeStringList(byKey.get('categories'), defaultCategories),
    aiActiveProvider: normalizeAiProvider(byKey.get('aiActiveProvider')),
    aiClientConfigs: normalizeAiClientConfigs(byKey.get('aiClientConfigs'))
  }
}

export function useSettings() {
  const { request } = useApi()
  const toastStore = useToastStore()
  const authStore = useAuthStore()

  const settings = shallowRef<SettingsState>({
    businessSettings: { ...defaultBusinessSettings },
    machines: [...defaultMachines],
    categories: [...defaultCategories],
    aiActiveProvider: 'qwen',
    aiClientConfigs: {}
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

  async function saveBusinessSettings(payload: BusinessSettings) {
    saving.value = true
    error.value = null
    try {
      const normalized: BusinessSettings = {
        lowStockThreshold: normalizeInteger(payload.lowStockThreshold, defaultBusinessSettings.lowStockThreshold, 0),
        restockTargetDays: normalizeInteger(payload.restockTargetDays, defaultBusinessSettings.restockTargetDays, 1)
      }
      await Promise.all([
        saveSetting('businessSettings', normalized),
        saveSetting('lowStockThreshold', normalized.lowStockThreshold),
        saveSetting('restockTargetDays', normalized.restockTargetDays)
      ])
      settings.value = { ...settings.value, businessSettings: normalized }
      toastStore.show('业务参数已保存', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
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

  async function saveAiClientConfigs(configs: AiClientConfigs) {
    saving.value = true
    error.value = null
    try {
      const response = await saveSetting('aiClientConfigs', configs)
      settings.value = {
        ...settings.value,
        aiClientConfigs: normalizeAiClientConfigs(response.value)
      }
      toastStore.show('AI provider 设置已保存', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function saveAiClientSettings(activeProvider: AiProviderId, configs: AiClientConfigs) {
    saving.value = true
    error.value = null
    try {
      const normalizedProvider = normalizeAiProvider(activeProvider)
      const response = await saveSetting('aiClientConfigs', configs)
      await saveSetting('aiActiveProvider', normalizedProvider)
      settings.value = {
        ...settings.value,
        aiActiveProvider: normalizedProvider,
        aiClientConfigs: normalizeAiClientConfigs(response.value)
      }
      toastStore.show('AI 设置已保存', 'success')
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function fetchAiModels(provider: AiProviderId) {
    return await request<{ models: string[] }, Record<string, unknown>>('/ai-proxy', {
      method: 'POST',
      body: {
        action: 'models',
        platform: provider
      }
    })
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
    providerOptions: aiProviderOptions,
    loadSettings,
    saveBusinessSettings,
    saveMachines,
    saveCategories,
    saveAiClientConfigs,
    saveAiClientSettings,
    fetchAiModels,
    updateAccount
  }
}
