<script setup lang="ts">
import type { DashboardCostGapItem } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  items: readonly DashboardCostGapItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  resolve: [item: DashboardCostGapItem]
}>()
</script>

<template>
  <section class="cost-gap surface-panel" aria-label="成本缺口榜">
    <header class="cost-gap__header">
      <div>
        <h2 class="cost-gap__title">成本缺口</h2>
        <p class="cost-gap__description">缺少成本快照的销售商品</p>
      </div>
      <StatusBadge :label="`${props.items.length} 项`" :tone="props.items.length ? 'warning' : 'success'" />
    </header>

    <div v-if="props.loading" class="cost-gap__empty">
      加载成本缺口
    </div>
    <div v-else-if="props.items.length === 0" class="cost-gap__empty">
      暂无成本缺口
    </div>
    <div v-else class="cost-gap__list">
      <article v-for="item in props.items" :key="item.productGlobalId" class="cost-gap__item">
        <div class="cost-gap__main">
          <strong>{{ item.productName }}</strong>
          <span>{{ item.category || '其他' }}</span>
        </div>
        <div class="cost-gap__meta">
          <strong class="numeric">{{ formatQuantity(item.quantity) }} 件</strong>
          <span>销售额 {{ formatMoney(item.salesAmount) }}</span>
          <AppButton size="sm" variant="secondary" @click="emit('resolve', item)">
            补成本
          </AppButton>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.cost-gap {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.cost-gap__header,
.cost-gap__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.cost-gap__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.cost-gap__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.cost-gap__empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.cost-gap__list {
  display: grid;
  gap: var(--space-2);
}

.cost-gap__item {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.cost-gap__main,
.cost-gap__meta {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.cost-gap__main span,
.cost-gap__meta span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.cost-gap__meta {
  text-align: right;
  justify-items: end;
}

.cost-gap__meta strong {
  color: var(--color-outbound);
}

@media (max-width: 560px) {
  .cost-gap {
    padding: var(--space-3);
  }

  .cost-gap__item {
    display: grid;
  }

  .cost-gap__meta {
    text-align: left;
    justify-items: start;
  }
}
</style>
