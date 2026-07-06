<script setup lang="ts">
import type { ProductRankingItem } from '~/types/report'
import { formatMoney, formatPercent, formatQuantity } from '~/utils/format'

const props = defineProps<{
  items: readonly ProductRankingItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  view: [item: ProductRankingItem]
  viewAll: []
}>()

const PRODUCT_RANKING_LIMIT = 5

const maxProfit = computed(() =>
  Math.max(...props.items.map(item => Math.abs(Number(item.profit) || 0)), 0)
)

const visibleItems = computed(() => props.items.slice(0, PRODUCT_RANKING_LIMIT))
const hiddenCount = computed(() => Math.max(0, props.items.length - visibleItems.value.length))
const countLabel = computed(() => {
  if (props.loading) return '加载中'
  if (!props.items.length) return '0 项'
  if (!hiddenCount.value) return `${props.items.length} 项`
  return `前 ${visibleItems.value.length} / 共 ${props.items.length} 项`
})

function widthFor(item: ProductRankingItem) {
  if (!maxProfit.value) return '0%'
  return `${Math.max(8, Math.round((Math.abs(item.profit) / maxProfit.value) * 100))}%`
}
</script>

<template>
  <section class="product-ranking surface-panel" aria-label="商品净利润总额排行">
    <header class="product-ranking__header">
      <div>
        <h2 class="product-ranking__title">商品净利润总额排行</h2>
        <p class="product-ranking__description">按净利润总额排序，完整清单到商品页查看</p>
      </div>
      <StatusBadge :label="countLabel" tone="info" />
    </header>

    <div v-if="props.loading" class="product-ranking__empty">
      加载商品排行
    </div>
    <div v-else-if="props.items.length === 0" class="product-ranking__empty">
      当前月份暂无商品净利润数据
    </div>
    <div v-else class="product-ranking__list">
      <article v-for="item in visibleItems" :key="item.productGlobalId" class="product-ranking__item">
        <div class="product-ranking__top">
          <strong>{{ item.productName }}</strong>
          <span class="numeric">{{ formatMoney(item.profit) }}</span>
          <AppButton size="sm" variant="secondary" @click="emit('view', item)">
            查看商品
          </AppButton>
        </div>
        <div class="product-ranking__bar-track" aria-hidden="true">
          <span class="product-ranking__bar" :style="{ width: widthFor(item) }" />
        </div>
        <div class="product-ranking__meta">
          <span>净收入 {{ formatMoney(item.netRevenue) }}</span>
          <span>成本 {{ formatMoney(item.cogs) }}</span>
          <span>{{ formatQuantity(item.quantity) }} 件</span>
          <span>净利润率 {{ formatPercent(item.profitRate) }}</span>
        </div>
      </article>
      <footer v-if="hiddenCount > 0" class="product-ranking__footer">
        <span>还有 {{ hiddenCount }} 个商品未显示</span>
        <AppButton size="sm" variant="secondary" @click="emit('viewAll')">
          查看全部
        </AppButton>
      </footer>
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

.product-ranking__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
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
  gap: var(--space-2);
}

.product-ranking__item {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.product-ranking__top {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: var(--space-2);
}

.product-ranking__top strong {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.product-ranking__top :deep(.app-button) {
  align-self: start;
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

.product-ranking__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .product-ranking {
    padding: var(--space-3);
  }

  .product-ranking__header,
  .product-ranking__footer {
    display: grid;
  }

  .product-ranking__top {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .product-ranking__top :deep(.app-button) {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
