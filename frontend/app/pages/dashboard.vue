<script setup lang="ts">
import { useReports } from '~/composables/useReports'

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
</script>

<template>
  <div class="dashboard-page">
    <header class="dashboard-page__header">
      <div>
        <h1 class="dashboard-page__title">仪表盘</h1>
        <p class="dashboard-page__description">
          查看经营指标、销售趋势、售货机排行和库存风险。
        </p>
      </div>
      <StatusBadge :label="loading ? '更新中' : '已更新'" :tone="loading ? 'warning' : 'success'" />
    </header>

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

    <div class="dashboard-page__grid">
      <div class="dashboard-page__column">
        <SalesTrendPanel
          :points="report?.salesTrend ?? []"
          :loading="loading"
        />
        <ExceptionsPanel
          :items="report?.recentExceptions ?? []"
          :loading="loading"
        />
      </div>
      <div class="dashboard-page__column">
        <MachineRankingPanel
          :items="report?.machineRanking ?? []"
          :loading="loading"
        />
        <LowStockPanel
          :items="report?.lowStock ?? []"
          :loading="loading"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.dashboard-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.dashboard-page__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.dashboard-page__description {
  max-width: 760px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.7;
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

.dashboard-page__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
  gap: var(--space-4);
  align-items: start;
}

.dashboard-page__column {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  align-content: start;
}

@media (max-width: 1080px) {
  .dashboard-page__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .dashboard-page {
    gap: var(--space-3);
  }

  .dashboard-page__header {
    display: grid;
    align-items: start;
    justify-items: start;
  }

  .dashboard-page__error {
    display: grid;
  }

  .dashboard-page__title {
    font-size: 20px;
  }
}
</style>
