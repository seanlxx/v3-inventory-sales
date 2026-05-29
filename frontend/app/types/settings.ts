export type SettingEntry<T = unknown> = {
  key: string
  value: T
}

export type BusinessSettings = {
  lowStockThreshold: number
  restockTargetDays: number
}

export type AiProviderId = 'opencode' | 'qwen' | 'deepseek' | 'claude' | 'yunwu'

export type AiProviderOption = {
  id: AiProviderId
  label: string
  defaultBaseUrl: string
  keyEnv: string
  baseUrlEnv: string
}

export type AiClientConfig = {
  apiKey?: string
  apiKeyMasked?: string
  baseUrl?: string
  modelId?: string
  configured?: boolean
}

export type AiClientConfigs = Partial<Record<AiProviderId, AiClientConfig>>

export type SettingsState = {
  businessSettings: BusinessSettings
  machines: string[]
  categories: string[]
  aiActiveProvider: AiProviderId
  aiClientConfigs: AiClientConfigs
}
