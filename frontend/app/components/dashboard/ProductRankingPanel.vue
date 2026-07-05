<script setup lang="ts">
import type { ProductRankingItem } from '~/types/report'
import { formatMoney, formatPercent, formatQuantity } from '~/utils/format'

const props = defineProps<{
  items: readonly ProductRankingItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  view: [item: ProductRankingItem]
}>()

const maxProfit = computed(() =>
  Math.max(...props.items.map(item => Math.abs(Number(item.profit) || 0)), 0)
)

function widthFor(item: ProductRankingItem) {
  if (!maxProfit.value) return '0%'
  return `${Math.max(8, Math.round((Math.abs(item.profit) / maxProfit.value) * 100))}%`
}
</script>

<template>
  <section class="product-ranking surface-panel" aria-label="商品毛利排行">
    <header class="product-ranking__header">
      <div>
        <h2 class="product-ranking__title">商品毛利排行</h2>
        <p class="product-ranking__description">按全局商品汇总销量、销售额和毛利</p>
      </div>
    </header>

    <div v-if="props.loading" class="product-ranking__empty">
      加载商品排行
    </div>
    <div v-else-if="props.items.length === 0" class="product-ranking__empty">
      当前月份暂无商品毛利数据
    </div>
    <div v-else class="product-ranking__list">
      <article v-for="item in props.items" :key="item.productGlobalId" class="product-ranking__item">
        <div class="product-ranking__row">
          <strong>{{ item.productName }}</strong>
          <span class="numeric">{{ formatMoney(item.profit) }}</span>
        </div>
        <div class="product-ranking__bar-track" aria-hidden="true">
          <span class="product-ranking__bar" :style="{ width: widthFor(item) }" />
        </div>
        <div class="product-ranking__meta">
          <span>销售 {{ formatMoney(item.salesAmount) }}</span>
          <span>成本 {{ formatMoney(item.cogs) }}</span>
          <span>{{ formatQuantity(item.quantity) }} 件</span>
          <span>毛利率 {{ formatPercent(item.profitRate) }}</span>
        </div>
        <AppButton size="sm" variant="secondary" @click="emit('view', item)">
          查看商品
        </AppButton>
      </article>
    </div>
  </section>
</template>

<style scoped>
.product-ranking {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.product-ranking__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.product-ranking__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.product-ranking__empty {
  min-height: 160px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.product-ranking__list {
  display: grid;
  gap: var(--space-3);
}

.product-ranking__item {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
}

.product-ranking__row {
  min-width: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-3);
}

.product-ranking__row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.product-ranking__bar-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-muted);
}

.product-ranking__bar {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: var(--color-success);
}

.product-ranking__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  color: var(--color-text-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .product-ranking {
    padding: var(--space-3);
  }

  .product-ranking__row {
    display: grid;
  }
}
</style>
