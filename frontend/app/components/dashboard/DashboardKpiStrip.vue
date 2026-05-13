<script setup lang="ts">
import type { DashboardKpis } from '~/types/report'
import { formatMoney } from '~/utils/format'

const props = defineProps<{
  kpis?: DashboardKpis
  loading?: boolean
}>()

const kpiItems = computed(() => [
  {
    key: 'todayRevenue',
    label: '今日销售额',
    value: formatMoney(props.kpis?.todayRevenue),
    tone: 'primary'
  },
  {
    key: 'monthRevenue',
    label: '本月销售额',
    value: formatMoney(props.kpis?.monthRevenue),
    tone: 'primary'
  },
  {
    key: 'monthGrossProfit',
    label: '本月毛利',
    value: formatMoney(props.kpis?.monthGrossProfit),
    tone: Number(props.kpis?.monthGrossProfit || 0) >= 0 ? 'success' : 'danger'
  },
  {
    key: 'profitRate',
    label: '利润率',
    value: `${Number(props.kpis?.profitRate || 0).toFixed(1)}%`,
    tone: 'info'
  },
  {
    key: 'purchaseCost',
    label: '进货成本',
    value: formatMoney(props.kpis?.purchaseCost),
    tone: 'neutral'
  },
  {
    key: 'refunds',
    label: '退款',
    value: formatMoney(props.kpis?.refunds),
    tone: 'warning'
  },
  {
    key: 'lowStockCount',
    label: '低库存',
    value: `${Number(props.kpis?.lowStockCount || 0)} 项`,
    tone: Number(props.kpis?.lowStockCount || 0) > 0 ? 'danger' : 'success'
  }
])
</script>

<template>
  <section class="dashboard-kpis" aria-label="经营指标">
    <article
      v-for="item in kpiItems"
      :key="item.key"
      class="dashboard-kpis__item surface-panel"
      :class="`dashboard-kpis__item--${item.tone}`"
    >
      <span class="dashboard-kpis__label">{{ item.label }}</span>
      <strong class="dashboard-kpis__value numeric">
        {{ props.loading ? '加载中' : item.value }}
      </strong>
    </article>
  </section>
</template>

<style scoped>
.dashboard-kpis {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-3);
}

.dashboard-kpis__item {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-left: 4px solid var(--color-border);
}

.dashboard-kpis__item--primary {
  border-left-color: var(--color-primary);
}

.dashboard-kpis__item--success {
  border-left-color: var(--color-inbound);
}

.dashboard-kpis__item--danger {
  border-left-color: var(--color-outbound);
}

.dashboard-kpis__item--warning {
  border-left-color: var(--color-warning);
}

.dashboard-kpis__item--info {
  border-left-color: var(--color-info);
}

.dashboard-kpis__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.dashboard-kpis__value {
  color: var(--color-text);
  font-size: 20px;
  line-height: 1.25;
}

@media (max-width: 1240px) {
  .dashboard-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .dashboard-kpis {
    display: flex;
    overflow-x: auto;
    padding-bottom: var(--space-1);
    -webkit-overflow-scrolling: touch;
  }

  .dashboard-kpis__item {
    min-width: 176px;
    padding: var(--space-3);
  }

  .dashboard-kpis__value {
    font-size: 18px;
  }
}
</style>
