<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { SalesOrder, SalesOrderType } from '~/types/sale'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  orders: readonly SalesOrder[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  view: [order: SalesOrder]
  void: [order: SalesOrder]
  retry: []
}>()

function typeLabel(type: SalesOrderType) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  return '销售'
}

function typeTone(type: SalesOrderType) {
  if (type === 'refund') return 'info'
  if (type === 'loss') return 'danger'
  return 'success'
}

function orderQuantity(order: SalesOrder) {
  return order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
}
</script>

<template>
  <section class="sales-table" aria-label="销售退款损耗单列表">
    <div class="sales-table__scroll">
      <table class="sales-table__table">
        <thead>
          <tr>
            <th scope="col">单据</th>
            <th scope="col">类型</th>
            <th scope="col">日期</th>
            <th scope="col">售货机</th>
            <th scope="col" class="sales-table__number">明细</th>
            <th scope="col" class="sales-table__number">数量</th>
            <th scope="col" class="sales-table__number">金额</th>
            <th scope="col">状态</th>
            <th scope="col" class="sales-table__actions-heading">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="sales-table__state" colspan="9">
              正在加载单据
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="sales-table__state sales-table__state--error" colspan="9">
              <div class="sales-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.orders.length === 0">
            <td class="sales-table__state" colspan="9">
              没有符合筛选条件的单据
            </td>
          </tr>
          <tr v-for="order in props.orders" v-else :key="order.id">
            <td>
              <div class="sales-table__order">
                <strong>{{ order.id }}</strong>
                <span>{{ formatDateTime(order.createdAt) }}</span>
              </div>
            </td>
            <td>
              <StatusBadge :label="typeLabel(order.type)" :tone="typeTone(order.type)" />
            </td>
            <td>{{ order.date }}</td>
            <td>{{ order.machineId || '-' }}</td>
            <td class="sales-table__number">
              {{ order.items.length }} 项
            </td>
            <td class="sales-table__number">
              {{ formatQuantity(orderQuantity(order)) }}
            </td>
            <td class="sales-table__number">
              {{ formatMoney(order.totalAmount) }}
            </td>
            <td>
              <StatusBadge
                :label="order.status === 'voided' ? '已作废' : '正常'"
                :tone="order.status === 'voided' ? 'warning' : 'success'"
              />
            </td>
            <td>
              <div class="sales-table__actions">
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
.sales-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.sales-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.sales-table__table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
}

.sales-table__table th,
.sales-table__table td {
  height: 54px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.sales-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.sales-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sales-table__actions-heading {
  text-align: right;
}

.sales-table__order {
  display: grid;
  gap: 4px;
}

.sales-table__order strong,
.sales-table__order span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sales-table__order span {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}

.sales-table__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.sales-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.sales-table__state--error {
  color: var(--color-danger);
}

.sales-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .sales-table__table {
    min-width: 900px;
  }

  .sales-table__table th,
  .sales-table__table td {
    height: 52px;
    padding: 0 var(--space-3);
  }
}
</style>
