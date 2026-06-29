export type SettingEntry<T = unknown> = {
  key: string
  value: T
}

export type BusinessSettings = {
  lowStockThreshold: number
  restockTargetDays: number
}

export type SettingsState = {
  businessSettings: BusinessSettings
  machines: string[]
  categories: string[]
}
