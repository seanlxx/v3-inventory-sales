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
  movements: [product: Product]
  retry: []
}>()

function stockTone(product: Product) {
  const stock = Number(product.currentStock) || 0
  if (stock <= 0) return 'danger'
  if (stock <= 5) return 'warning'
  return 'success'
}
</script>

<template>
  <section class="product-table" aria-label="商品列表">
    <div class="product-table__scroll">
      <table class="product-table__table">
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col">分类</th>
            <th scope="col">售货机</th>
            <th scope="col" class="product-table__number">售价</th>
            <th scope="col" class="product-table__number">库存</th>
            <th scope="col">状态</th>
            <th scope="col" class="product-table__actions-heading">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="product-table__state" colspan="7">
              正在加载商品
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="product-table__state product-table__state--error" colspan="7">
              <div class="product-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.products.length === 0">
            <td class="product-table__state" colspan="7">
              没有符合筛选条件的商品
            </td>
          </tr>
          <tr v-for="product in props.products" v-else :key="product.id">
            <td>
              <div class="product-table__name-cell">
                <div class="product-table__image" aria-hidden="true">
                  {{ product.name.slice(0, 1) || '商' }}
                </div>
                <div class="product-table__name-copy">
                  <strong>{{ product.name }}</strong>
                  <span>{{ product.id }}</span>
                </div>
              </div>
            </td>
            <td>
              <StatusBadge :label="product.category || '其他'" tone="neutral" />
            </td>
            <td>{{ product.machineId }}</td>
            <td class="product-table__number">
              {{ formatMoney(product.sellPrice) }}
            </td>
            <td class="product-table__number">
              <button class="product-table__stock-button" type="button" @click="emit('movements', product)">
                <StatusBadge :label="`${formatQuantity(product.currentStock)} 件`" :tone="stockTone(product)" />
                <span>只读</span>
              </button>
            </td>
            <td>
              <StatusBadge
                :label="product.status === 'archived' ? '已归档' : '正常'"
                :tone="product.status === 'archived' ? 'warning' : 'success'"
              />
            </td>
            <td>
              <div class="product-table__actions">
                <AppButton size="sm" variant="secondary" :disabled="product.status === 'archived'" @click="emit('edit', product)">
                  编辑
                </AppButton>
                <AppButton size="sm" variant="secondary" @click="emit('movements', product)">
                  流水
                </AppButton>
                <AppButton size="sm" variant="danger" :disabled="product.status === 'archived'" @click="emit('archive', product)">
                  归档
                </AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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

.product-table__name-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.product-table__image {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 800;
}

.product-table__name-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.product-table__name-copy strong,
.product-table__name-copy span {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-table__name-copy span {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}

.product-table__stock-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
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
  justify-content: flex-end;
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

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .product-table__table {
    min-width: 820px;
  }

  .product-table__table th,
  .product-table__table td {
    height: 52px;
    padding: 0 var(--space-3);
  }

  .product-table__name-copy strong,
  .product-table__name-copy span {
    max-width: 190px;
  }
}
</style>
