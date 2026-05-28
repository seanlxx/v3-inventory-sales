<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'

const { theme } = useTheme()

type NavigationItem = {
  label: string
  shortLabel: string
  to: string
  symbol: string
  mobile: boolean
}

const navigationItems: readonly NavigationItem[] = [
  { label: '仪表盘', shortLabel: '仪表盘', to: '/dashboard', symbol: 'D', mobile: true },
  { label: '商品', shortLabel: '商品', to: '/products', symbol: 'P', mobile: true },
  { label: '库存', shortLabel: '库存', to: '/inventory', symbol: 'I', mobile: true },
  { label: '进货', shortLabel: '进货', to: '/purchases', symbol: 'B', mobile: true },
  { label: '销售', shortLabel: '销售', to: '/sales', symbol: 'S', mobile: true },
  { label: '设置', shortLabel: '设置', to: '/settings', symbol: 'G', mobile: false }
]

const fallbackNavigationItem: NavigationItem = {
  label: '工作台',
  shortLabel: '工作台',
  to: '/dashboard',
  symbol: 'V',
  mobile: false
}

const route = useRoute()
const { loading } = useApi()
const toastStore = useToastStore()

const currentNavigationItem = computed(() =>
  navigationItems.find(item => item.to === route.path.replace(/\/$/, '')) ?? fallbackNavigationItem
)

const mobileNavigationItems = computed(() => navigationItems.filter(item => item.mobile))
</script>

<template>
  <div class="app-shell" :class="'theme-' + theme">
    <!-- 动态科技霓虹背景 -->
    <div v-if="theme === 'cyber'" class="cyber-bg" aria-hidden="true">
      <div class="cyber-bg__glow cyber-bg__glow--1"></div>
      <div class="cyber-bg__glow cyber-bg__glow--2"></div>
      <div class="cyber-bg__glow cyber-bg__glow--3"></div>
      <div class="cyber-bg__grid"></div>
    </div>

    <!-- 白水晶流光背景 -->
    <div v-else-if="theme === 'crystal'" class="crystal-bg" aria-hidden="true">
      <div class="crystal-bg__glow crystal-bg__glow--1"></div>
      <div class="crystal-bg__glow crystal-bg__glow--2"></div>
      <div class="crystal-bg__glow crystal-bg__glow--3"></div>
      <div class="crystal-bg__grid"></div>
    </div>

    <aside class="app-shell__sidebar" aria-label="桌面主导航">
      <NuxtLink class="app-shell__brand" to="/dashboard">
        <span class="app-shell__brand-mark">V3</span>
        <span class="app-shell__brand-copy">
          <span class="app-shell__brand-title">售货机管理</span>
          <span class="app-shell__brand-subtitle">Inventory console</span>
        </span>
      </NuxtLink>

      <nav class="app-shell__nav">
        <NuxtLink
          v-for="item in navigationItems"
          :key="item.to"
          class="app-shell__nav-link"
          active-class="app-shell__nav-link--active"
          :to="item.to"
        >
          <span class="app-shell__nav-symbol" aria-hidden="true">{{ item.symbol }}</span>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </aside>

    <div class="app-shell__workspace">
      <header class="app-shell__topbar">
        <div class="app-shell__topbar-main">
          <p class="app-shell__eyebrow">经营控制台</p>
          <h1 class="app-shell__title">{{ currentNavigationItem.label }}</h1>
        </div>

        <div class="app-shell__topbar-actions">
          <AppInput
            class="app-shell__search"
            model-value=""
            label="全局搜索"
            placeholder="搜索占位"
            readonly
          />
          <StatusBadge v-if="loading" label="请求中" tone="warning" />
          <StatusBadge v-else label="游客访问" tone="neutral" />
          <NuxtLink class="app-shell__settings-link" to="/settings" aria-label="打开设置">
            设置
          </NuxtLink>
        </div>
      </header>

      <div v-if="toastStore.latest" class="app-shell__toast" role="status">
        {{ toastStore.latest.message }}
      </div>

      <main class="app-shell__content">
        <slot />
      </main>
    </div>

    <nav class="app-shell__bottom-nav" aria-label="移动端主导航">
      <NuxtLink
        v-for="item in mobileNavigationItems"
        :key="item.to"
        class="app-shell__bottom-link"
        active-class="app-shell__bottom-link--active"
        :to="item.to"
      >
        <span>{{ item.shortLabel }}</span>
      </NuxtLink>
    </nav>


  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--layout-sidebar-width) minmax(0, 1fr);
  background: var(--color-bg);
  color: var(--color-text);
}

.app-shell__sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-5) 14px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.app-shell__brand {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 4px 8px;
  color: var(--color-text);
  text-decoration: none;
}

.app-shell__brand-mark {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: var(--radius-2);
  background: var(--color-primary);
  color: #ffffff;
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 13px;
}

.app-shell__brand-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.app-shell__brand-title {
  font-weight: 800;
  line-height: 1.2;
}

.app-shell__brand-subtitle {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.2;
}

.app-shell__nav {
  display: grid;
  gap: var(--space-1);
}

.app-shell__nav-link {
  position: relative;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-3);
  border-radius: var(--radius-2);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 14px;
  transition: background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-bounce), box-shadow var(--transition-fast);
}

.app-shell__nav-link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
  transform: translateX(4px);
}

.app-shell__nav-link:active {
  transform: translateX(2px) scale(0.98);
}

.app-shell__nav-link--active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 800;
}

.app-shell__nav-link--active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 0 var(--radius-1) var(--radius-1) 0;
  background: var(--color-primary);
}

.app-shell__nav-symbol {
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: var(--radius-1);
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.75;
}

.app-shell__workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-shell__topbar {
  position: sticky;
  z-index: 10;
  top: 0;
  min-height: var(--layout-topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-5);
  padding: 10px var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: rgb(255 255 255 / 82%);
  box-shadow: var(--shadow-topbar);
  backdrop-filter: blur(20px) saturate(190%);
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.app-shell__topbar-main {
  min-width: 0;
  flex: 1 1 220px;
}

.app-shell__eyebrow {
  margin: 0 0 2px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.app-shell__title {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
}

.app-shell__topbar-actions {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.app-shell__search {
  width: auto;
  min-width: 180px;
  max-width: 280px;
  flex: 1 1 220px;
}

.app-shell__settings-link {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
}

.app-shell__content {
  min-width: 0;
  flex: 1;
  padding: var(--space-6);
}

.app-shell__toast {
  margin: var(--space-4) var(--space-6) 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-weight: 700;
}

.app-shell__bottom-nav {
  display: none;
}

@media (max-width: 880px) {
  .app-shell__search {
    display: none;
  }
}

@media (max-width: 760px) {
  .app-shell {
    display: block;
    min-width: 0;
    background: var(--mobile-bg);
    padding-bottom: calc(var(--layout-mobile-nav-height) + env(safe-area-inset-bottom));
  }

  .app-shell__sidebar {
    display: none;
  }

  .app-shell__topbar {
    min-height: var(--layout-mobile-topbar-height);
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    gap: 0;
    padding: env(safe-area-inset-top) var(--mobile-page-padding) 0;
    border-bottom-color: var(--mobile-divider);
    background: var(--mobile-card-bg);
    box-shadow: none;
    backdrop-filter: none;
  }

  .app-shell__eyebrow {
    display: none;
  }

  .app-shell__topbar-main {
    grid-column: 2;
    min-width: 0;
    text-align: center;
  }

  .app-shell__title {
    overflow: hidden;
    color: var(--mobile-text);
    font-size: 17px;
    font-weight: 800;
    line-height: 44px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-shell__topbar-actions {
    grid-column: 3;
    min-width: 0;
    justify-content: end;
    gap: 0;
  }

  .app-shell__topbar-actions :deep(.status-badge),
  .app-shell__topbar-actions :deep(.app-button),
  .app-shell__topbar-actions > :not(.app-shell__settings-link) {
    display: none;
  }

  .app-shell__settings-link {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--mobile-primary);
    font-size: 13px;
    font-weight: 800;
  }

  .app-shell__content {
    padding: var(--mobile-section-gap) var(--mobile-page-padding) 0;
  }

  .app-shell__toast {
    margin: var(--space-3) var(--space-4) 0;
  }

  .app-shell__bottom-nav {
    position: fixed;
    z-index: 20;
    right: 0;
    bottom: 0;
    left: 0;
    height: calc(var(--layout-mobile-nav-height) + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: 0 6px env(safe-area-inset-bottom);
    border-top: 1px solid var(--mobile-border);
    background: var(--mobile-card-bg);
    box-shadow: 0 -4px 14px rgb(23 32 51 / 6%);
    backdrop-filter: none;
    transition: background-color var(--transition-fast);
  }

  .app-shell__bottom-link {
    min-width: 0;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 2px;
    color: var(--mobile-muted);
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    transition: color var(--transition-fast), transform var(--transition-bounce);
  }

  .app-shell__bottom-link:active {
    transform: scale(0.92);
  }

  .app-shell__bottom-link--active {
    color: var(--color-primary);
    font-weight: 800;
  }
}

/* 赛博霓虹外壳样式微调 */
.app-shell.theme-cyber {
  position: relative;
  background-color: #080b11;
}

.app-shell.theme-cyber :deep(.cyber-bg) {
  position: absolute;
  z-index: 1;
}

.app-shell.theme-cyber .app-shell__sidebar {
  background: rgba(17, 25, 40, 0.65);
  backdrop-filter: blur(24px) saturate(180%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 2;
}

.app-shell.theme-cyber .app-shell__workspace {
  position: relative;
  z-index: 2;
  min-width: 0;
}

.app-shell.theme-cyber .app-shell__topbar {
  background: rgba(17, 25, 40, 0.65);
  backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

.app-shell.theme-cyber .app-shell__settings-link {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}

.app-shell.theme-cyber .app-shell__bottom-nav {
  background: rgba(17, 25, 40, 0.85);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* 白水晶玻璃态外壳样式微调 */
.app-shell.theme-crystal {
  position: relative;
  background-color: #f6f8fb;
}

.app-shell.theme-crystal :deep(.crystal-bg) {
  position: absolute;
  z-index: 1;
}

.app-shell.theme-crystal .app-shell__sidebar {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(20px) saturate(180%);
  border-right: 1px solid rgba(255, 255, 255, 0.6);
  z-index: 2;
}

.app-shell.theme-crystal .app-shell__workspace {
  position: relative;
  z-index: 2;
  min-width: 0;
}

.app-shell.theme-crystal .app-shell__topbar {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.03);
  z-index: 10;
}

.app-shell.theme-crystal .app-shell__settings-link {
  background: rgba(255, 255, 255, 0.5);
  border-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(5px);
  box-shadow: var(--shadow-sm);
}

.app-shell.theme-crystal .app-shell__bottom-nav {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.6);
}
</style>
