<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { PurchaseOrder } from '~/types/purchase'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  orders: readonly PurchaseOrder[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  view: [order: PurchaseOrder]
  void: [order: PurchaseOrder]
  retry: []
}>()
</script>

<template>
  <section class="purchase-table" aria-label="进货单列表">
    <div class="purchase-table__scroll">
      <table class="purchase-table__table">
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">供应商</th>
            <th scope="col">售货机</th>
            <th scope="col" class="purchase-table__number">明细</th>
            <th scope="col" class="purchase-table__number">数量</th>
            <th scope="col" class="purchase-table__number">金额</th>
            <th scope="col">状态</th>
            <th scope="col" class="purchase-table__actions-heading">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="purchase-table__state" colspan="8">
              正在加载进货单
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="purchase-table__state purchase-table__state--error" colspan="8">
              <div class="purchase-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.orders.length === 0">
            <td class="purchase-table__state" colspan="8">
              没有符合筛选条件的进货单
            </td>
          </tr>
          <tr v-for="order in props.orders" v-else :key="order.id">
            <td>{{ order.date }}</td>
            <td>{{ order.source || '拼多多' }}</td>
            <td>{{ order.machineId || '-' }}</td>
            <td class="purchase-table__number">
              {{ order.items.length }} 项
            </td>
            <td class="purchase-table__number">
              {{ formatQuantity(order.quantity) }}
            </td>
            <td class="purchase-table__number">
              {{ formatMoney(order.totalCost) }}
            </td>
            <td>
              <StatusBadge
                :label="order.status === 'voided' ? '已作废' : '正常'"
                :tone="order.status === 'voided' ? 'warning' : 'success'"
              />
            </td>
            <td>
              <div class="purchase-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('view', order)">
                  查看
                </AppButton>
                <AppButton
                  size="sm"
                  variant="danger"
                  :disabled="order.status === 'voided'"
                  @click="emit('void', order)"
                >
                  作废
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
.purchase-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.purchase-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.purchase-table__table {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
}

.purchase-table__table th,
.purchase-table__table td {
  height: 54px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.purchase-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.purchase-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.purchase-table__actions-heading {
  text-align: right;
}

.purchase-table__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.purchase-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.purchase-table__state--error {
  color: var(--color-danger);
}

.purchase-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .purchase-table__table {
    min-width: 700px;
  }

  .purchase-table__table th,
  .purchase-table__table td {
    height: 52px;
    padding: 0 var(--space-3);
  }
}
</style>
