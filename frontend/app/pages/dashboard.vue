<script setup lang="ts">
import { useReports } from '~/composables/useReports'
import type { DashboardException, ProductRankingItem } from '~/types/report'

definePageMeta({
  title: '仪表盘'
})

const {
  report,
  filters,
  machineOptions,
  loading,
  error,
  updateFilters,
  loadDashboard
} = useReports()

watch(() => [filters.month, filters.days, filters.machineId] as const, () => {
  loadDashboard()
})

onMounted(() => {
  loadDashboard()
})

function openExceptionTarget(item: DashboardException) {
  if (item.refType !== 'products_global' || !item.refId) return
  navigateTo({
    path: '/products',
    query: {
      productGlobalId: item.refId
    }
  })
}

function openProductRankingItem(item: ProductRankingItem) {
  navigateTo({
    path: '/products',
    query: {
      productGlobalId: item.productGlobalId
    }
  })
}

function openProducts() {
  navigateTo('/products')
}
</script>

<template>
  <div class="dashboard-page">
    <DashboardFilters
      :filters="filters"
      :machines="machineOptions"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadDashboard"
    />

    <section v-if="error" class="dashboard-page__error surface-panel" role="alert">
      <div>
        <h2 class="dashboard-page__error-title">仪表盘数据加载失败</h2>
        <p class="dashboard-page__error-message">{{ error.message }}</p>
      </div>
      <AppButton variant="secondary" :loading="loading" @click="loadDashboard">
        重试
      </AppButton>
    </section>

    <DashboardKpiStrip :kpis="report?.kpis" :loading="loading" />

    <div class="dashboard-page__primary">
      <SalesTrendPanel
        :points="report?.salesTrend ?? []"
        :machine-series="report?.salesTrendByMachine ?? []"
        :days="filters.days"
        :loading="loading"
        @update-days="updateFilters({ days: $event })"
      />
      <MachineRankingPanel
        :items="report?.profitBreakdown ?? []"
        :loading="loading"
      />
    </div>

    <div class="dashboard-page__secondary">
      <ProductRankingPanel
        :items="report?.productRanking ?? []"
        :loading="loading"
        @view="openProductRankingItem"
        @view-all="openProducts"
      />
      <ExceptionsPanel
        :items="report?.recentExceptions ?? []"
        :loading="loading"
        title="商品合并"
        description="旧商品归并到全局商品的结果"
        empty-message="暂无商品合并"
        @view="openExceptionTarget"
      />
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.dashboard-page__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-color: rgb(194 65 12 / 28%);
  background: var(--color-danger-soft);
}

.dashboard-page__error-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.dashboard-page__error-message {
  margin: var(--space-1) 0 0;
  color: var(--color-danger);
  font-weight: 700;
}

.dashboard-page__primary,
.dashboard-page__secondary {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--space-4);
}

.dashboard-page__primary {
  align-items: stretch;
}

.dashboard-page__secondary {
  align-items: start;
}

.dashboard-page__primary > :first-child {
  grid-column: span 8;
}

.dashboard-page__primary > :last-child {
  grid-column: span 4;
}

.dashboard-page__secondary > :first-child {
  grid-column: span 8;
}

.dashboard-page__secondary > :last-child {
  grid-column: span 4;
}

.dashboard-page__primary > *,
.dashboard-page__secondary > * {
  min-width: 0;
}

@media (max-width: 1160px) {
  .dashboard-page__primary {
    grid-template-columns: 1fr;
  }

  .dashboard-page__primary > :first-child,
  .dashboard-page__primary > :last-child {
    grid-column: auto;
  }

  .dashboard-page__secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-page__secondary > :first-child,
  .dashboard-page__secondary > :last-child {
    grid-column: auto;
  }
}

@media (max-width: 760px) {
  .dashboard-page {
    gap: var(--space-3);
  }

  .dashboard-page__primary,
  .dashboard-page__secondary {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  .dashboard-page__secondary > :first-child,
  .dashboard-page__secondary > :last-child {
    grid-column: auto;
  }

  .dashboard-page__error {
    display: grid;
  }
}
</style>
