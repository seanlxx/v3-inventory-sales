<script setup lang="ts">
import type { InventoryBalance } from '~/types/inventory'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  items: readonly InventoryBalance[]
  loading?: boolean
}>()
</script>

<template>
  <section class="low-stock surface-panel" aria-label="库存风险榜">
    <header class="low-stock__header">
      <div>
        <h2 class="low-stock__title">库存风险</h2>
        <p class="low-stock__description">低于阈值的商品</p>
      </div>
      <StatusBadge :label="`${props.items.length} 项`" :tone="props.items.length ? 'warning' : 'success'" />
    </header>

    <div v-if="props.loading" class="low-stock__empty">
      加载库存风险
    </div>
    <div v-else-if="props.items.length === 0" class="low-stock__empty">
      暂无低库存商品
    </div>
    <div v-else class="low-stock__list">
      <article v-for="item in props.items" :key="item.productId" class="low-stock__item">
        <div class="low-stock__main">
          <strong>{{ item.productName }}</strong>
          <span>{{ item.category || '其他' }}</span>
        </div>
        <div class="low-stock__meta">
          <strong class="numeric">{{ formatQuantity(item.quantityOnHand) }} 件</strong>
          <span>阈值 {{ formatQuantity(item.lowStockThreshold) }} · 货值 {{ formatMoney(item.inventoryValue) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.low-stock {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.low-stock__header,
.low-stock__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.low-stock__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.low-stock__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.low-stock__empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.low-stock__list {
  display: grid;
  gap: var(--space-2);
}

.low-stock__item {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.low-stock__main,
.low-stock__meta {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.low-stock__main span,
.low-stock__meta span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.low-stock__meta {
  text-align: right;
}

.low-stock__meta strong {
  color: var(--color-outbound);
}

@media (max-width: 560px) {
  .low-stock {
    padding: var(--space-3);
  }

  .low-stock__item {
    display: grid;
  }

  .low-stock__meta {
    text-align: left;
  }
}
</style>
