import { ref } from 'vue'

export type ThemeType = 'default' | 'cyber'

const currentTheme = ref<ThemeType>('default')

export function useTheme() {
  function initTheme() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('theme') as ThemeType
    if (saved === 'cyber') {
      setTheme('cyber')
    } else {
      setTheme('default')
    }
  }

  function setTheme(theme: ThemeType) {
    currentTheme.value = theme
    if (!import.meta.client) return
    
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }

  return {
    theme: currentTheme,
    initTheme,
    setTheme
  }
}
