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
  edit: [product: ProfitProduct]
  updateStatus: [product: ProfitProduct, status: ProfitProduct['status']]
  viewPurchases: [product: ProfitProduct]
  viewSales: [product: ProfitProduct]
}>()

type SortKey = 'productName' | 'category' | 'aliasCount' | 'defaultSellPrice' | 'lastCost' | 'purchaseCost' | 'saleQuantity' | 'salesAmount' | 'grossProfit' | 'status'
type SortDirection = 'asc' | 'desc'

const sortKey = shallowRef<SortKey | null>(null)
const sortDirection = shallowRef<SortDirection>('asc')

const defaultSortDirection: Record<SortKey, SortDirection> = {
  productName: 'asc',
  category: 'asc',
  aliasCount: 'desc',
  defaultSellPrice: 'desc',
  lastCost: 'desc',
  purchaseCost: 'desc',
  saleQuantity: 'desc',
  salesAmount: 'desc',
  grossProfit: 'desc',
  status: 'asc'
}

function profitTone(product: ProfitProduct) {
  if (Number(product.grossProfit) > 0) return 'success'
  if (Number(product.salesAmount) > 0) return 'warning'
  return 'neutral'
}

function statusLabel(product: ProfitProduct) {
  return product.status === 'archived' ? '已归档' : '在售'
}

function sortValue(product: ProfitProduct, key: SortKey) {
  if (key === 'category') return product.category || '其他'
  if (key === 'status') return statusLabel(product)
  return product[key]
}

function compareValues(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    return (Number(left) || 0) - (Number(right) || 0)
  }
  return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  })
}

const sortedProducts = computed(() => {
  if (!sortKey.value) return props.products
  return [...props.products]
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const result = compareValues(
        sortValue(left.product, sortKey.value as SortKey),
        sortValue(right.product, sortKey.value as SortKey)
      )
      const directed = sortDirection.value === 'asc' ? result : -result
      return directed || left.index - right.index
    })
    .map(item => item.product)
})

function updateSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = defaultSortDirection[key]
}

function sortLabel(key: SortKey) {
  if (sortKey.value !== key) return ''
  return sortDirection.value === 'asc' ? '升序' : '降序'
}

function sortSymbol(key: SortKey) {
  if (sortKey.value !== key) return '↕'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

function ariaSort(key: SortKey) {
  if (sortKey.value !== key) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}
</script>

<template>
  <section class="profit-product-table" aria-label="全局商品利润档案">
    <div class="profit-product-table__scroll">
      <table class="profit-product-table__table">
        <thead>
          <tr>
            <th scope="col" class="profit-product-table__th--product" :aria-sort="ariaSort('productName')">
              <button class="profit-product-table__sort" type="button" @click="updateSort('productName')">
                <span>全局商品</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('productName') }}</span>
                <span class="sr-only">{{ sortLabel('productName') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('category')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('category')">
                <span>分类</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('category') }}</span>
                <span class="sr-only">{{ sortLabel('category') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('aliasCount')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('aliasCount')">
                <span>别名</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('aliasCount') }}</span>
                <span class="sr-only">{{ sortLabel('aliasCount') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('defaultSellPrice')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('defaultSellPrice')">
                <span>售价</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('defaultSellPrice') }}</span>
                <span class="sr-only">{{ sortLabel('defaultSellPrice') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('lastCost')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('lastCost')">
                <span>最近成本</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('lastCost') }}</span>
                <span class="sr-only">{{ sortLabel('lastCost') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('purchaseCost')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('purchaseCost')">
                <span>进货成本</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('purchaseCost') }}</span>
                <span class="sr-only">{{ sortLabel('purchaseCost') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('saleQuantity')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('saleQuantity')">
                <span>销量</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('saleQuantity') }}</span>
                <span class="sr-only">{{ sortLabel('saleQuantity') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('salesAmount')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('salesAmount')">
                <span>销售额</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('salesAmount') }}</span>
                <span class="sr-only">{{ sortLabel('salesAmount') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('grossProfit')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('grossProfit')">
                <span>毛利</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('grossProfit') }}</span>
                <span class="sr-only">{{ sortLabel('grossProfit') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center" :aria-sort="ariaSort('status')">
              <button class="profit-product-table__sort profit-product-table__sort--center" type="button" @click="updateSort('status')">
                <span>状态</span>
                <span class="profit-product-table__sort-icon" aria-hidden="true">{{ sortSymbol('status') }}</span>
                <span class="sr-only">{{ sortLabel('status') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-product-table__center profit-product-table__th--actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="profit-product-table__state" colspan="11">正在加载全局商品</td>
          </tr>
          <tr v-else-if="props.error">
            <td class="profit-product-table__state profit-product-table__state--error" colspan="11">
              <div class="profit-product-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.products.length === 0">
            <td class="profit-product-table__state" colspan="11">没有符合筛选条件的全局商品</td>
          </tr>
          <tr v-for="product in sortedProducts" v-else :key="product.productGlobalId">
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
                :label="statusLabel(product)"
                :tone="product.status === 'archived' ? 'warning' : 'success'"
              />
            </td>
            <td class="profit-product-table__center">
              <div class="profit-product-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('viewPurchases', product)">
                  进货
                </AppButton>
                <AppButton size="sm" variant="secondary" @click="emit('viewSales', product)">
                  销售
                </AppButton>
                <AppButton size="sm" variant="secondary" @click="emit('edit', product)">
                  编辑
                </AppButton>
                <AppButton
                  size="sm"
                  :variant="product.status === 'archived' ? 'secondary' : 'ghost'"
                  @click="emit('updateStatus', product, product.status === 'archived' ? 'active' : 'archived')"
                >
                  {{ product.status === 'archived' ? '恢复' : '归档' }}
                </AppButton>
              </div>
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
          v-for="product in sortedProducts"
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
          <footer class="profit-product-table__card-actions">
            <AppButton size="sm" variant="secondary" @click="emit('viewPurchases', product)">
              进货
            </AppButton>
            <AppButton size="sm" variant="secondary" @click="emit('viewSales', product)">
              销售
            </AppButton>
            <AppButton size="sm" variant="secondary" @click="emit('edit', product)">
              编辑
            </AppButton>
            <AppButton
              size="sm"
              :variant="product.status === 'archived' ? 'secondary' : 'ghost'"
              @click="emit('updateStatus', product, product.status === 'archived' ? 'active' : 'archived')"
            >
              {{ product.status === 'archived' ? '恢复' : '归档' }}
            </AppButton>
          </footer>
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
  min-width: 1320px;
  border-collapse: collapse;
  table-layout: fixed;
}

.profit-product-table__th--product {
  width: 240px;
}

.profit-product-table__th--actions {
  width: 260px;
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

.profit-product-table__sort {
  width: 100%;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

.profit-product-table__sort--center {
  justify-content: center;
}

.profit-product-table__sort-icon {
  color: var(--color-text-soft);
  font-size: 11px;
  line-height: 1;
}

.profit-product-table__sort:hover,
.profit-product-table__sort:focus-visible {
  color: var(--color-primary);
}

.profit-product-table__sort:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  border-radius: var(--radius-1);
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

.profit-product-table__actions {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  justify-content: center;
  gap: var(--space-2);
}

.profit-product-table__cards {
  display: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
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

  .profit-product-table__card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
}
</style>
