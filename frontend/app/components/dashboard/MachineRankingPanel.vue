<script setup lang="ts">
import type { MachineRankingItem } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  items: readonly MachineRankingItem[]
  loading?: boolean
}>()

const maxProfit = computed(() =>
  Math.max(...props.items.map(item => Math.abs(Number(item.profit) || 0)), 0)
)

function widthFor(item: MachineRankingItem) {
  if (!maxProfit.value) return '0%'
  return `${Math.max(8, Math.round((Math.abs(item.profit) / maxProfit.value) * 100))}%`
}
</script>

<template>
  <section class="machine-ranking surface-panel" aria-label="毛利拆分">
    <header class="machine-ranking__header">
      <div>
        <h2 class="machine-ranking__title">毛利拆分</h2>
        <p class="machine-ranking__description">1/2号机合并，三号机独立显示</p>
      </div>
    </header>

    <div v-if="props.loading" class="machine-ranking__empty">
      加载毛利拆分
    </div>
    <div v-else-if="props.items.length === 0" class="machine-ranking__empty">
      当前月份暂无毛利数据
    </div>
    <div v-else class="machine-ranking__list">
      <article v-for="item in props.items" :key="item.machineId" class="machine-ranking__item">
        <div class="machine-ranking__row">
          <strong>{{ item.machineId }}</strong>
          <span class="numeric">{{ formatMoney(item.profit) }}</span>
        </div>
        <div class="machine-ranking__bar-track" aria-hidden="true">
          <span class="machine-ranking__bar" :style="{ width: widthFor(item) }" />
        </div>
        <div class="machine-ranking__row machine-ranking__row--muted">
          <span>销售额 {{ formatMoney(item.revenue) }}</span>
          <span>{{ formatQuantity(item.quantity) }} 件</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.machine-ranking {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.machine-ranking__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.machine-ranking__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.machine-ranking__empty {
  min-height: 160px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.machine-ranking__list {
  display: grid;
  gap: var(--space-3);
}

.machine-ranking__item {
  display: grid;
  gap: var(--space-2);
}

.machine-ranking__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.machine-ranking__row--muted {
  color: var(--color-text-muted);
  font-size: 12px;
}

.machine-ranking__bar-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-muted);
}

.machine-ranking__bar {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: var(--color-info);
}

@media (max-width: 760px) {
  .machine-ranking {
    padding: var(--space-3);
  }
}
</style>
