<script setup lang="ts">
import type { Product } from '~/types/product'
import type { SalesItem, SalesOrderType } from '~/types/sale'
import { formatMoney, formatQuantity } from '~/utils/format'
import { displayMachineName } from '~/utils/machines'

const items = defineModel<SalesItem[]>({ default: () => [] })

const props = defineProps<{
  products: readonly Product[]
  type: SalesOrderType
}>()

const totalAmount = computed(() =>
  items.value.reduce((sum, item) => sum + Number(item.itemRevenue || 0), 0)
)

function productById(productId: string) {
  return props.products.find(product => product.id === productId)
}

function addItem() {
  items.value = [
    ...items.value,
    {
      productId: '',
      productName: '',
      quantity: 1,
      sellPrice: 0,
      itemRevenue: 0
    }
  ]
}

function removeItem(index: number) {
  items.value = items.value.filter((_, itemIndex) => itemIndex !== index)
}

function updateItem(index: number, patch: Partial<SalesItem>) {
  items.value = items.value.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const next = { ...item, ...patch }
    if (patch.productId) {
      const product = productById(patch.productId)
      next.productName = product?.name || ''
      next.sellPrice = Number(product?.sellPrice) || 0
    }
    if ('quantity' in patch || 'sellPrice' in patch || 'productId' in patch) {
      next.quantity = Math.abs(Number(next.quantity) || 0)
      next.sellPrice = props.type === 'loss' ? 0 : Math.abs(Number(next.sellPrice) || 0)
      next.itemRevenue = props.type === 'loss'
        ? 0
        : Math.round(next.quantity * next.sellPrice * 100) / 100
    }
    return next
  })
}
</script>

<template>
  <section class="sales-items" aria-label="销售明细">
    <header class="sales-items__header">
      <div>
        <h3 class="sales-items__title">商品明细</h3>
        <p class="sales-items__description">
          数量始终录入正数，销售/退款/损耗由单据类型决定库存方向。
        </p>
      </div>
      <AppButton variant="secondary" @click="addItem">
        添加一行
      </AppButton>
    </header>

    <div class="sales-items__scroll">
      <table class="sales-items__table">
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col" class="sales-items__number">当前库存</th>
            <th scope="col" class="sales-items__number">数量</th>
            <th scope="col" class="sales-items__number">单价</th>
            <th scope="col" class="sales-items__number">小计</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="items.length === 0">
            <td class="sales-items__empty" colspan="6">
              请添加商品明细
            </td>
          </tr>
          <tr v-for="(item, index) in items" v-else :key="`${item.id || 'draft'}-${index}`">
            <td>
              <select
                class="sales-items__select"
                :value="item.productId"
                @change="updateItem(index, { productId: ($event.target as HTMLSelectElement).value })"
              >
                <option value="">选择商品</option>
                <option v-for="product in props.products" :key="product.id" :value="product.id">
                  {{ product.name }} · {{ displayMachineName(product.machineId) }}
                </option>
              </select>
            </td>
            <td class="sales-items__number">
              {{ formatQuantity(productById(item.productId)?.currentStock) }}
            </td>
            <td class="sales-items__number">
              <input
                class="sales-items__input"
                type="number"
                min="1"
                :value="item.quantity"
                @input="updateItem(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
              >
            </td>
            <td class="sales-items__number">
              <input
                class="sales-items__input"
                type="number"
                min="0"
                step="0.01"
                :disabled="props.type === 'loss'"
                :value="props.type === 'loss' ? 0 : item.sellPrice"
                @input="updateItem(index, { sellPrice: Number(($event.target as HTMLInputElement).value) })"
              >
            </td>
            <td class="sales-items__number">
              {{ formatMoney(props.type === 'loss' ? 0 : item.itemRevenue) }}
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

    <footer class="sales-items__footer">
      <span>{{ props.type === 'loss' ? '损耗不计销售收入' : '合计' }}</span>
      <strong>{{ formatMoney(props.type === 'loss' ? 0 : totalAmount) }}</strong>
    </footer>
  </section>
</template>

<style scoped>
.sales-items {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.sales-items__header,
.sales-items__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.sales-items__title {
  margin: 0;
  font-size: 16px;
}

.sales-items__description {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.sales-items__scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
}

.sales-items__table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.sales-items__table th,
.sales-items__table td {
  height: 52px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.sales-items__table th {
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.sales-items__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sales-items__select,
.sales-items__input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.sales-items__input {
  max-width: 112px;
  text-align: right;
}

.sales-items__empty {
  color: var(--color-text-muted);
  text-align: center;
}

.sales-items__footer {
  justify-content: flex-end;
  color: var(--color-text-muted);
}

.sales-items__footer strong {
  color: var(--color-text);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .sales-items__header {
    display: grid;
  }

  .sales-items__table {
    min-width: 720px;
  }
}
</style>
