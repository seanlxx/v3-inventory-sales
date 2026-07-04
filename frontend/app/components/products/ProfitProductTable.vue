<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { ProfitProduct } from '~/types/profit'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  products: readonly ProfitProduct[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  retry: []
}>()

function profitTone(product: ProfitProduct) {
  if (Number(product.grossProfit) > 0) return 'success'
  if (Number(product.salesAmount) > 0) return 'warning'
  return 'neutral'
}
</script>

<template>
  <section class="profit-product-table" aria-label="全局商品利润档案">
    <div class="profit-product-table__scroll">
      <table class="profit-product-table__table">
        <thead>
          <tr>
            <th scope="col" class="profit-product-table__th--product">全局商品</th>
            <th scope="col" class="profit-product-table__center">分类</th>
            <th scope="col" class="profit-product-table__center">别名</th>
            <th scope="col" class="profit-product-table__center">售价</th>
            <th scope="col" class="profit-product-table__center">最近成本</th>
            <th scope="col" class="profit-product-table__center">进货成本</th>
            <th scope="col" class="profit-product-table__center">销量</th>
            <th scope="col" class="profit-product-table__center">销售额</th>
            <th scope="col" class="profit-product-table__center">毛利</th>
            <th scope="col" class="profit-product-table__center">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="profit-product-table__state" colspan="10">正在加载全局商品</td>
          </tr>
          <tr v-else-if="props.error">
            <td class="profit-product-table__state profit-product-table__state--error" colspan="10">
              <div class="profit-product-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.products.length === 0">
            <td class="profit-product-table__state" colspan="10">没有符合筛选条件的全局商品</td>
          </tr>
          <tr v-for="product in props.products" v-else :key="product.productGlobalId">
            <td>
              <div class="profit-product-table__name-cell">
                <strong :title="product.productName">{{ product.productName }}</strong>
                <span>{{ product.normalizedName }}</span>
              </div>
            </td>
            <td class="profit-product-table__center">
              <StatusBadge :label="product.category || '其他'" tone="neutral" />
            </td>
            <td class="profit-product-table__center numeric">{{ formatQuantity(product.aliasCount) }}</td>
            <td class="profit-product-table__center numeric">{{ formatMoney(product.defaultSellPrice) }}</td>
            <td class="profit-product-table__center numeric">
              {{ product.lastCost > 0 ? formatMoney(product.lastCost) : '—' }}
            </td>
            <td class="profit-product-table__center numeric">{{ formatMoney(product.purchaseCost) }}</td>
            <td class="profit-product-table__center numeric">{{ formatQuantity(product.saleQuantity) }}</td>
            <td class="profit-product-table__center numeric">{{ formatMoney(product.salesAmount) }}</td>
            <td class="profit-product-table__center numeric">
              <StatusBadge :label="formatMoney(product.grossProfit)" :tone="profitTone(product)" />
            </td>
            <td class="profit-product-table__center">
              <StatusBadge
                :label="product.status === 'archived' ? '已归档' : '在售'"
                :tone="product.status === 'archived' ? 'warning' : 'success'"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="profit-product-table__cards" aria-label="全局商品移动列表">
      <MobileStateCard v-if="props.loading" title="正在加载全局商品" />
      <MobileStateCard v-else-if="props.error" :title="props.error.message" tone="danger">
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </MobileStateCard>
      <MobileStateCard
        v-else-if="props.products.length === 0"
        title="没有全局商品"
        description="当前筛选条件下没有结果"
      />
      <template v-else>
        <MobileCard
          v-for="product in props.products"
          :key="product.productGlobalId"
          class="profit-product-table__card"
          :accent="product.status === 'archived' ? 'neutral' : 'primary'"
        >
          <header class="profit-product-table__card-header">
            <div class="profit-product-table__card-main">
              <strong class="profit-product-table__card-name">{{ product.productName }}</strong>
              <span class="profit-product-table__card-meta">
                {{ product.category || '其他' }} · {{ formatQuantity(product.aliasCount) }} 个别名
              </span>
            </div>
            <StatusBadge
              :label="product.status === 'archived' ? '归档' : '在售'"
              :tone="product.status === 'archived' ? 'neutral' : 'success'"
            />
          </header>
          <div class="profit-product-table__card-grid">
            <span>售价 {{ formatMoney(product.defaultSellPrice) }}</span>
            <span>最近成本 {{ product.lastCost > 0 ? formatMoney(product.lastCost) : '—' }}</span>
            <span>销量 {{ formatQuantity(product.saleQuantity) }}</span>
            <span>销售额 {{ formatMoney(product.salesAmount) }}</span>
            <span>成本 {{ formatMoney(product.cogs) }}</span>
            <span>毛利 {{ formatMoney(product.grossProfit) }}</span>
          </div>
        </MobileCard>
      </template>
    </div>
  </section>
</template>

<style scoped>
.profit-product-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.profit-product-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.profit-product-table__table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  table-layout: fixed;
}

.profit-product-table__th--product {
  width: 240px;
}

.profit-product-table__table th,
.profit-product-table__table td {
  height: 54px;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  vertical-align: middle;
}

.profit-product-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.profit-product-table__center {
  text-align: center !important;
}

.profit-product-table__name-cell {
  min-width: 0;
  display: grid;
  gap: 2px;
  padding: 6px var(--space-3);
  border: 1px solid rgba(37, 99, 235, 0.08);
  border-radius: var(--radius-2);
  background: var(--color-primary-soft);
  box-shadow: var(--shadow-inset);
}

.profit-product-table__name-cell strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.profit-product-table__name-cell span {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-product-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.profit-product-table__state--error {
  color: var(--color-danger);
}

.profit-product-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.profit-product-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background-color: var(--color-surface-subtle);
}

@media (max-width: 760px) {
  .profit-product-table {
    border: 0;
    background: transparent;
  }

  .profit-product-table__scroll {
    display: none;
  }

  .profit-product-table__cards {
    display: grid;
    gap: var(--mobile-section-gap);
  }

  .profit-product-table__card {
    display: grid;
    gap: 10px;
    padding: var(--mobile-card-padding);
  }

  .profit-product-table__card-header {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .profit-product-table__card-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .profit-product-table__card-name {
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: var(--mobile-text);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.35;
    word-break: break-word;
  }

  .profit-product-table__card-meta {
    color: var(--mobile-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .profit-product-table__card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding-top: 9px;
    border-top: 1px solid var(--mobile-divider);
    color: var(--mobile-muted);
    font-size: 12px;
    font-weight: 700;
  }
}
</style>
