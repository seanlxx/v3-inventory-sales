<script setup lang="ts">
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
const { username, isAuthenticated } = useAuth()
const { loading } = useApi()
const toastStore = useToastStore()

const currentNavigationItem = computed(() =>
  navigationItems.find(item => item.to === route.path) ?? fallbackNavigationItem
)

const mobileNavigationItems = computed(() => navigationItems.filter(item => item.mobile))
const authLabel = computed(() => isAuthenticated.value ? username.value || '已登录' : '未登录')
</script>

<template>
  <div class="app-shell">
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
          <p class="app-shell__eyebrow">Nuxt 4 并行开发</p>
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
          <StatusBadge v-else :label="authLabel" :tone="isAuthenticated ? 'success' : 'neutral'" />
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
        <span class="app-shell__bottom-symbol" aria-hidden="true">{{ item.symbol }}</span>
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
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-3);
  border-radius: var(--radius-2);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 14px;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.app-shell__nav-link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-shell__nav-link--active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 800;
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
  gap: var(--space-5);
  padding: 10px var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: rgb(255 255 255 / 94%);
  box-shadow: var(--shadow-topbar);
  backdrop-filter: blur(12px);
}

.app-shell__topbar-main {
  min-width: 0;
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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.app-shell__search {
  width: 240px;
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
    padding-bottom: calc(var(--layout-mobile-nav-height) + env(safe-area-inset-bottom));
  }

  .app-shell__sidebar {
    display: none;
  }

  .app-shell__topbar {
    min-height: var(--layout-mobile-topbar-height);
    padding: 8px var(--space-4);
  }

  .app-shell__eyebrow {
    display: none;
  }

  .app-shell__title {
    font-size: 18px;
  }

  .app-shell__topbar-actions {
    gap: var(--space-2);
  }

  .app-shell__settings-link {
    min-width: 44px;
    min-height: 44px;
    padding: 0 var(--space-3);
  }

  .app-shell__content {
    padding: var(--space-4);
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
    border-top: 1px solid var(--color-border);
    background: rgb(255 255 255 / 96%);
    box-shadow: 0 -8px 24px rgb(23 32 51 / 8%);
    backdrop-filter: blur(12px);
  }

  .app-shell__bottom-link {
    min-width: 0;
    min-height: 56px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    padding: 4px 2px;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 12px;
  }

  .app-shell__bottom-link--active {
    color: var(--color-primary);
    font-weight: 800;
  }

  .app-shell__bottom-symbol {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: var(--radius-1);
    font-family: var(--font-mono);
    font-size: 10px;
  }
}
</style>
