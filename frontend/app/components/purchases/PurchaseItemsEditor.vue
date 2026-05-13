<script setup lang="ts">
import type { Product } from '~/types/product'
import type { PurchaseItem } from '~/types/purchase'
import { formatMoney } from '~/utils/format'

const items = defineModel<PurchaseItem[]>({ default: () => [] })

const props = defineProps<{
  products: readonly Product[]
}>()

const totalCost = computed(() =>
  items.value.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
)

function productName(productId: string) {
  return props.products.find(product => product.id === productId)?.name || ''
}

function addItem() {
  items.value = [
    ...items.value,
    {
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0
    }
  ]
}

function removeItem(index: number) {
  items.value = items.value.filter((_, itemIndex) => itemIndex !== index)
}

function updateItem(index: number, patch: Partial<PurchaseItem>) {
  items.value = items.value.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const next = { ...item, ...patch }
    if (patch.productId) {
      next.productName = productName(patch.productId)
    }
    if ('quantity' in patch || 'unitPrice' in patch) {
      next.totalPrice = Math.round((Number(next.quantity) || 0) * (Number(next.unitPrice) || 0) * 100) / 100
    }
    return next
  })
}
</script>

<template>
  <section class="purchase-items" aria-label="进货明细">
    <header class="purchase-items__header">
      <div>
        <h3 class="purchase-items__title">商品明细</h3>
        <p class="purchase-items__description">
          一张进货单可包含多个商品，确认提交后统一入库。
        </p>
      </div>
      <AppButton variant="secondary" @click="addItem">
        添加一行
      </AppButton>
    </header>

    <div class="purchase-items__scroll">
      <table class="purchase-items__table">
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col" class="purchase-items__number">数量</th>
            <th scope="col" class="purchase-items__number">单价</th>
            <th scope="col" class="purchase-items__number">小计</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="items.length === 0">
            <td class="purchase-items__empty" colspan="5">
              请添加进货商品
            </td>
          </tr>
          <tr v-for="(item, index) in items" v-else :key="`${item.id || 'draft'}-${index}`">
            <td>
              <select
                class="purchase-items__select"
                :value="item.productId"
                @change="updateItem(index, { productId: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">选择商品</option>
                <option v-for="product in props.products" :key="product.id" :value="product.id">
                  {{ product.name }} · {{ product.machineId }}
                </option>
              </select>
            </td>
            <td class="purchase-items__number">
              <input
                class="purchase-items__input"
                type="number"
                min="1"
                :value="item.quantity"
                @input="updateItem(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
              >
            </td>
            <td class="purchase-items__number">
              <input
                class="purchase-items__input"
                type="number"
                min="0"
                step="0.01"
                :value="item.unitPrice"
                @input="updateItem(index, { unitPrice: Number(($event.target as HTMLInputElement).value) })"
              >
            </td>
            <td class="purchase-items__number">
              {{ formatMoney(item.totalPrice) }}
            </td>
            <td>
              <AppButton size="sm" variant="danger" @click="removeItem(index)">
                移除
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="purchase-items__footer">
      <span>合计</span>
      <strong>{{ formatMoney(totalCost) }}</strong>
    </footer>
  </section>
</template>

<style scoped>
.purchase-items {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.purchase-items__header,
.purchase-items__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.purchase-items__title {
  margin: 0;
  font-size: 16px;
}

.purchase-items__description {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.purchase-items__scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
}

.purchase-items__table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.purchase-items__table th,
.purchase-items__table td {
  height: 52px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.purchase-items__table th {
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.purchase-items__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.purchase-items__select,
.purchase-items__input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.purchase-items__input {
  max-width: 120px;
  text-align: right;
}

.purchase-items__empty {
  color: var(--color-text-muted);
  text-align: center;
}

.purchase-items__footer {
  justify-content: flex-end;
  color: var(--color-text-muted);
}

.purchase-items__footer strong {
  color: var(--color-text);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .purchase-items__header {
    display: grid;
  }

  .purchase-items__table {
    min-width: 680px;
  }
}
</style>
