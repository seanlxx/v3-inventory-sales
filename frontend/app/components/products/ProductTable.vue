<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { Product } from '~/types/product'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  products: readonly Product[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  edit: [product: Product]
  archive: [product: Product]
  restore: [product: Product]
  movements: [product: Product]
  retry: []
}>()

function stockToneForQuantity(stock: number) {
  if (stock <= 0) return 'danger'
  if (stock <= 5) return 'warning'
  return 'success'
}

function stockTone(product: Product) {
  return stockToneForQuantity(Number(product.currentStock) || 0)
}

function purchaseCost(product: Product) {
  return Number(product.purchaseAvgCost) || Number(product.avgCost) || 0
}
</script>

<template>
  <section class="product-table" aria-label="商品列表">
    <div class="product-table__scroll">
      <table class="product-table__table">
        <thead>
          <tr>
            <th scope="col" class="product-table__th--product">商品</th>
            <th scope="col" class="product-table__th--category product-table__center">分类</th>
            <th scope="col" class="product-table__th--machine product-table__center">售货机</th>
            <th scope="col" class="product-table__th--price product-table__center">售价</th>
            <th scope="col" class="product-table__th--cost product-table__center">进货价</th>
            <th scope="col" class="product-table__th--stock product-table__center">总库存</th>
            <th scope="col" class="product-table__th--status product-table__center">状态</th>
            <th scope="col" class="product-table__th--actions product-table__center">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="product-table__state" colspan="8">
              正在加载商品
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="product-table__state product-table__state--error" colspan="8">
              <div class="product-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.products.length === 0">
            <td class="product-table__state" colspan="8">
              没有符合筛选条件的商品
            </td>
          </tr>
          <tr v-for="product in props.products" v-else :key="product.id">
            <td>
              <div class="product-table__name-cell">
                <div class="product-table__name-copy">
                  <strong :title="product.name">{{ product.name.slice(0, 6) + (product.name.length > 6 ? '...' : '') }}</strong>
                  <span>{{ product.id }}</span>
                </div>
              </div>
            </td>
            <td class="product-table__center">
              <StatusBadge :label="product.category || '其他'" tone="neutral" />
            </td>
            <td class="product-table__center">{{ product.machineId }}</td>
            <td class="product-table__center">
              {{ formatMoney(product.sellPrice) }}
            </td>
            <td class="product-table__center product-table__cost">
              {{ purchaseCost(product) > 0 ? formatMoney(purchaseCost(product)) : '—' }}
            </td>
            <td class="product-table__center">
              <button class="product-table__stock-button" type="button" @click="emit('movements', product)">
                <StatusBadge :label="`${formatQuantity(product.currentStock)} 件`" :tone="stockTone(product)" />
              </button>
            </td>
            <td class="product-table__center">
              <StatusBadge
                :label="product.status === 'archived' ? '已下架' : '在售'"
                :tone="product.status === 'archived' ? 'warning' : 'success'"
              />
            </td>
            <td class="product-table__center">
              <div class="product-table__actions">
                <AppButton size="sm" variant="secondary" :disabled="product.status === 'archived'" @click="emit('edit', product)">
                  编辑
                </AppButton>
                <AppButton size="sm" variant="secondary" @click="emit('movements', product)">
                  流水
                </AppButton>
                <AppButton
                  v-if="product.status === 'archived'"
                  size="sm"
                  variant="secondary"
                  @click="emit('restore', product)"
                >
                  上架
                </AppButton>
                <AppButton v-else size="sm" variant="danger" @click="emit('archive', product)">
                  下架
                </AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="product-table__cards" aria-label="商品移动列表">
      <MobileStateCard
        v-if="props.loading"
        title="正在加载商品"
      />
      <MobileStateCard
        v-else-if="props.error"
        :title="props.error.message"
        tone="danger"
      >
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </MobileStateCard>
      <MobileStateCard
        v-else-if="props.products.length === 0"
        title="没有商品"
        description="当前筛选条件下没有结果"
      />
      <template v-else>
        <MobileCard
          v-for="product in props.products"
          :key="product.id"
          class="product-table__card"
          :accent="product.status === 'archived' ? 'neutral' : 'primary'"
        >
          <header class="product-table__card-header">
            <div class="product-table__card-main">
              <strong class="product-table__card-name">{{ product.name }}</strong>
              <span class="product-table__card-meta">{{ product.machineId }} · {{ product.category || '其他' }}</span>
            </div>
            <StatusBadge
              :label="product.status === 'archived' ? '停用' : '启用'"
              :tone="product.status === 'archived' ? 'neutral' : 'success'"
            />
          </header>

          <div class="product-table__card-footer">
            <span>售价 {{ formatMoney(product.sellPrice) }}</span>
            <span>进货价 {{ purchaseCost(product) > 0 ? formatMoney(purchaseCost(product)) : '—' }}</span>
            <button class="product-table__card-stock" type="button" @click="emit('movements', product)">
              库存 {{ formatQuantity(product.currentStock) }}
            </button>
          </div>
          <div class="product-table__card-actions">
            <AppButton size="sm" variant="secondary" :disabled="product.status === 'archived'" @click="emit('edit', product)">
              编辑
            </AppButton>
            <AppButton size="sm" variant="secondary" @click="emit('movements', product)">
              流水
            </AppButton>
            <AppButton
              v-if="product.status === 'archived'"
              size="sm"
              variant="secondary"
              @click="emit('restore', product)"
            >
              上架
            </AppButton>
            <AppButton v-else size="sm" variant="danger" @click="emit('archive', product)">
              下架
            </AppButton>
          </div>
        </MobileCard>
      </template>
    </div>
  </section>
</template>

<style scoped>
.product-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.product-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.product-table__table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  table-layout: fixed;
}

.product-table__th--product {
  width: 170px;
}

.product-table__th--category {
  width: 80px;
}

.product-table__th--machine {
  width: 90px;
}

.product-table__th--price {
  width: 90px;
}

.product-table__th--cost {
  width: 100px;
}

.product-table__cost {
  color: var(--color-text-soft);
  font-variant-numeric: tabular-nums;
}

.product-table__th--stock {
  width: 120px;
}

.product-table__th--status {
  width: 90px;
}

.product-table__th--actions {
  /* Flexible column to absorb extra space, squeezing all previous columns tightly to the left */
}

.product-table__table th,
.product-table__table td {
  height: 54px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.product-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.product-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.product-table__actions-heading {
  text-align: right;
}

.product-table__table th.product-table__center,
.product-table__table td.product-table__center {
  text-align: center;
}

.product-table__name-cell {
  display: flex;
  align-items: center;
}

.product-table__name-copy {
  min-width: 0;
  display: inline-grid;
  gap: 2px;
  padding: 5px var(--space-3);
  border-radius: var(--radius-2);
  background: var(--color-primary-soft);
  border: 1px solid rgba(37, 99, 235, 0.08);
  width: min(100%, 160px);
  box-shadow: var(--shadow-inset);
}

.product-table__name-copy strong,
.product-table__name-copy span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.product-table__name-copy span {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.product-table__stock-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-text-soft);
  cursor: pointer;
  font-size: 12px;
}

.product-table__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.product-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.product-table__state--error {
  color: var(--color-danger);
}

.product-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.product-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr {
  transition: background-color var(--transition-fast);
}

tbody tr:hover {
  background-color: var(--color-surface-subtle);
}


@media (max-width: 760px) {
  .product-table {
    border: 0;
    background: transparent;
  }

  .product-table__scroll {
    display: none;
  }

  .product-table__cards {
    display: grid;
    gap: var(--mobile-section-gap);
  }

  .product-table__card {
    display: grid;
    gap: 9px;
    padding: var(--mobile-card-padding);
  }

  .product-table__card-header {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .product-table__card-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .product-table__card-name {
    min-width: 0;
    overflow: hidden;
    color: var(--mobile-text);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-table__card-meta {
    min-width: 0;
    overflow: hidden;
    color: var(--mobile-muted);
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-table__card-footer {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-top: 9px;
    border-top: 1px solid var(--mobile-divider);
    color: var(--mobile-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .product-table__card-stock {
    min-height: 22px;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--mobile-muted);
    font: inherit;
    font-weight: 700;
  }

  .product-table__card-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    padding-top: 2px;
  }

  .product-table__card-actions :deep(.app-button) {
    width: 100%;
    min-width: 0;
  }
}
</style>
