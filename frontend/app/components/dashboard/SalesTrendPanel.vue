<script setup lang="ts">
import type { SalesTrendPoint } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  points: readonly SalesTrendPoint[]
  loading?: boolean
}>()

const maxRevenue = computed(() =>
  Math.max(...props.points.map(point => Number(point.revenue) || 0), 0)
)

function barHeight(point: SalesTrendPoint) {
  if (!maxRevenue.value) return '2px'
  return `${Math.max(8, Math.round((point.revenue / maxRevenue.value) * 120))}px`
}

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}
</script>

<template>
  <section class="sales-trend surface-panel" aria-label="销售趋势">
    <header class="sales-trend__header">
      <div>
        <h2 class="sales-trend__title">销售趋势</h2>
        <p class="sales-trend__description">读取服务端 reports 聚合结果</p>
      </div>
      <StatusBadge :label="`${props.points.length} 天`" tone="info" />
    </header>

    <div v-if="props.loading" class="sales-trend__empty">
      加载趋势数据
    </div>
    <div v-else-if="props.points.length === 0 || maxRevenue === 0" class="sales-trend__empty">
      当前范围暂无销售趋势
    </div>
    <div v-else class="sales-trend__chart">
      <div
        v-for="point in props.points"
        :key="point.date"
        class="sales-trend__bar-group"
        :title="`${point.date} ${formatMoney(point.revenue)} / ${formatQuantity(point.quantity)} 件`"
      >
        <div class="sales-trend__bar-track">
          <span class="sales-trend__bar" :style="{ height: barHeight(point) }" />
        </div>
        <span class="sales-trend__date">{{ shortDate(point.date) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sales-trend {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.sales-trend__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.sales-trend__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.sales-trend__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.sales-trend__empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.sales-trend__chart {
  min-height: 180px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
  gap: var(--space-2);
  align-items: end;
}

.sales-trend__bar-group {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  justify-items: center;
}

.sales-trend__bar-track {
  width: 100%;
  min-width: 18px;
  height: 132px;
  display: flex;
  align-items: end;
  justify-content: center;
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
}

.sales-trend__bar {
  width: min(26px, 70%);
  max-height: 100%;
  border-radius: var(--radius-2) var(--radius-2) 0 0;
  background: var(--color-primary);
}

.sales-trend__date {
  color: var(--color-text-soft);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .sales-trend {
    padding: var(--space-3);
  }

  .sales-trend__chart {
    min-height: 136px;
    grid-template-columns: repeat(auto-fit, minmax(32px, 1fr));
    gap: 7px;
  }

  .sales-trend__bar-track {
    min-width: 0;
    height: 104px;
  }

  .sales-trend__bar {
    width: min(22px, 66%);
  }
}
</style>
