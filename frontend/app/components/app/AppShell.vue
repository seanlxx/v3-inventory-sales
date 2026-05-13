<script setup lang="ts">
type NavigationItem = {
  label: string
  to: string
}

const navigationItems: readonly NavigationItem[] = [
  { label: '仪表盘', to: '/dashboard' },
  { label: '商品', to: '/products' },
  { label: '库存', to: '/inventory' },
  { label: '进货', to: '/purchases' },
  { label: '销售', to: '/sales' },
  { label: '设置', to: '/settings' }
]

const fallbackNavigationItem: NavigationItem = { label: '工作台', to: '/dashboard' }
const route = useRoute()

const currentNavigationItem = computed(() =>
  navigationItems.find(item => item.to === route.path) ?? fallbackNavigationItem
)
</script>

<template>
  <div class="app-shell">
    <aside class="app-shell__sidebar" aria-label="主导航">
      <NuxtLink class="app-shell__brand" to="/dashboard">
        <span class="app-shell__brand-mark">V3</span>
        <span class="app-shell__brand-text">售货机管理</span>
      </NuxtLink>

      <nav class="app-shell__nav">
        <NuxtLink
          v-for="item in navigationItems"
          :key="item.to"
          class="app-shell__nav-link"
          active-class="app-shell__nav-link--active"
          :to="item.to"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <div class="app-shell__workspace">
      <header class="app-shell__topbar">
        <div>
          <p class="app-shell__eyebrow">Nuxt 4 skeleton</p>
          <h1 class="app-shell__title">{{ currentNavigationItem.label }}</h1>
        </div>
        <div class="app-shell__status" aria-label="当前阶段">
          并行开发
        </div>
      </header>

      <main class="app-shell__content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  background: var(--color-bg);
  color: var(--color-text);
}

.app-shell__sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 14px;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.app-shell__brand {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  color: var(--color-text);
  text-decoration: none;
}

.app-shell__brand-mark {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 700;
  font-size: 13px;
}

.app-shell__brand-text {
  font-weight: 700;
}

.app-shell__nav {
  display: grid;
  gap: 4px;
}

.app-shell__nav-link {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 14px;
}

.app-shell__nav-link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-shell__nav-link--active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
}

.app-shell__workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-shell__topbar {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
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

.app-shell__status {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  font-size: 13px;
  white-space: nowrap;
}

.app-shell__content {
  min-width: 0;
  flex: 1;
  padding: 24px;
}

@media (max-width: 760px) {
  .app-shell {
    display: block;
    padding-bottom: calc(64px + env(safe-area-inset-bottom));
  }

  .app-shell__sidebar {
    position: fixed;
    z-index: 20;
    right: 0;
    bottom: 0;
    left: 0;
    display: block;
    padding: 0 8px env(safe-area-inset-bottom);
    border-top: 1px solid var(--color-border);
    border-right: 0;
  }

  .app-shell__brand {
    display: none;
  }

  .app-shell__nav {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0;
  }

  .app-shell__nav-link {
    min-height: 56px;
    justify-content: center;
    padding: 0 4px;
    border-radius: 0;
    font-size: 13px;
  }

  .app-shell__nav-link[href="/settings"] {
    display: none;
  }

  .app-shell__topbar {
    min-height: 56px;
    padding: 10px 16px;
  }

  .app-shell__title {
    font-size: 18px;
  }

  .app-shell__content {
    padding: 16px;
  }
}
</style>
