export type SettingEntry<T = unknown> = {
  key: string
  value: T
}

export type SettingsState = {
  machines: string[]
  categories: string[]
}
