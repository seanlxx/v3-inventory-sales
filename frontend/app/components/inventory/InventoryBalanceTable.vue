<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { InventoryBalance } from '~/types/inventory'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  balances: readonly InventoryBalance[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  movements: [balance: InventoryBalance]
  adjust: [balance: InventoryBalance]
  retry: []
}>()

function stockTone(balance: InventoryBalance) {
  if (Number(balance.quantityOnHand) <= 0) return 'danger'
  if (balance.isLowStock) return 'warning'
  return 'success'
}
</script>

<template>
  <section class="inventory-table" aria-label="库存余额表">
    <div class="inventory-table__scroll">
      <table class="inventory-table__table">
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col">分类</th>
            <th scope="col">售货机</th>
            <th scope="col" class="inventory-table__number">现存</th>
            <th scope="col" class="inventory-table__number">均价</th>
            <th scope="col" class="inventory-table__number">库存金额</th>
            <th scope="col">状态</th>
            <th scope="col">更新时间</th>
            <th scope="col" class="inventory-table__actions-heading">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="inventory-table__state" colspan="9">
              正在加载库存余额
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="inventory-table__state inventory-table__state--error" colspan="9">
              <div class="inventory-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.balances.length === 0">
            <td class="inventory-table__state" colspan="9">
              没有符合筛选条件的库存余额
            </td>
          </tr>
          <tr v-for="balance in props.balances" v-else :key="`${balance.productId}:${balance.machineId}`">
            <td>
              <div class="inventory-table__name-cell">
                <div class="inventory-table__image" aria-hidden="true">
                  {{ balance.productName.slice(0, 1) || '库' }}
                </div>
                <div class="inventory-table__name-copy">
                  <strong>{{ balance.productName }}</strong>
                  <span>{{ balance.productId }}</span>
                </div>
              </div>
            </td>
            <td>
              <StatusBadge :label="balance.category || '其他'" tone="neutral" />
            </td>
            <td>{{ balance.machineId }}</td>
            <td class="inventory-table__number">
              <button class="inventory-table__stock-button" type="button" @click="emit('movements', balance)">
                <StatusBadge :label="`${formatQuantity(balance.quantityOnHand)} 件`" :tone="stockTone(balance)" />
                <span>查流水</span>
              </button>
            </td>
            <td class="inventory-table__number">
              {{ formatMoney(balance.avgCost) }}
            </td>
            <td class="inventory-table__number">
              {{ formatMoney(balance.inventoryValue) }}
            </td>
            <td>
              <StatusBadge
                :label="balance.isLowStock ? `低于 ${formatQuantity(balance.lowStockThreshold)} 件` : '正常'"
                :tone="balance.isLowStock ? 'warning' : 'success'"
              />
            </td>
            <td>{{ formatDateTime(balance.updatedAt) }}</td>
            <td>
              <div class="inventory-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('movements', balance)">
                  流水
                </AppButton>
                <AppButton size="sm" @click="emit('adjust', balance)">
                  盘点
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
.inventory-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.inventory-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.inventory-table__table {
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
}

.inventory-table__table th,
.inventory-table__table td {
  height: 54px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.inventory-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.inventory-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.inventory-table__actions-heading {
  text-align: right;
}

.inventory-table__name-cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.inventory-table__image {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-info-soft);
  color: var(--color-info);
  font-weight: 800;
}

.inventory-table__name-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.inventory-table__name-copy strong,
.inventory-table__name-copy span {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inventory-table__name-copy span {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}

.inventory-table__stock-button {
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

.inventory-table__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.inventory-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.inventory-table__state--error {
  color: var(--color-danger);
}

.inventory-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .inventory-table__table {
    min-width: 960px;
  }

  .inventory-table__table th,
  .inventory-table__table td {
    height: 52px;
    padding: 0 var(--space-3);
  }

  .inventory-table__name-copy strong,
  .inventory-table__name-copy span {
    max-width: 190px;
  }
}
</style>
