<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { SalesOrder, SalesOrderType } from '~/types/sale'
import { formatMoney, formatQuantity } from '~/utils/format'

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
            <th scope="col" class="sales-table__center">类型</th>
            <th scope="col" class="sales-table__center">日期</th>
            <th scope="col" class="sales-table__center">售货机</th>
            <th scope="col" class="sales-table__center">明细</th>
            <th scope="col" class="sales-table__center">数量</th>
            <th scope="col" class="sales-table__center">金额</th>
            <th scope="col" class="sales-table__center">状态</th>
            <th scope="col" class="sales-table__center sales-table__actions-cell">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="sales-table__state" colspan="8">
              正在加载单据
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="sales-table__state sales-table__state--error" colspan="8">
              <div class="sales-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.orders.length === 0">
            <td class="sales-table__state" colspan="8">
              没有符合筛选条件的单据
            </td>
          </tr>
          <tr v-for="order in props.orders" v-else :key="order.id">
            <td class="sales-table__center">
              <StatusBadge :label="typeLabel(order.type)" :tone="typeTone(order.type)" />
            </td>
            <td class="sales-table__center">{{ order.date }}</td>
            <td class="sales-table__center">{{ order.machineId || '-' }}</td>
            <td class="sales-table__center">
              {{ order.items.length }} 项
            </td>
            <td class="sales-table__center">
              {{ formatQuantity(orderQuantity(order)) }}
            </td>
            <td class="sales-table__center">
              {{ formatMoney(order.totalAmount) }}
            </td>
            <td class="sales-table__center">
              <div class="sales-table__status">
                <StatusBadge
                  :label="order.status === 'voided' ? '已作废' : '正常'"
                  :tone="order.status === 'voided' ? 'warning' : 'success'"
                />
                <StatusBadge
                  v-if="order.source === 'shengma'"
                  label="盛码"
                  tone="info"
                />
              </div>
            </td>
            <td class="sales-table__center sales-table__actions-cell">
              <div class="sales-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('view', order)">
                  查看
                </AppButton>
                <AppButton
                  size="sm"
                  variant="danger"
                  :disabled="order.status === 'voided' || order.source === 'shengma'"
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

    <div class="sales-table__cards" aria-label="销售退款损耗单移动列表">
      <div v-if="props.loading" class="sales-table__card-state">
        正在加载单据
      </div>
      <div v-else-if="props.error" class="sales-table__card-state sales-table__card-state--error">
        <strong>{{ props.error.message }}</strong>
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </div>
      <div v-else-if="props.orders.length === 0" class="sales-table__card-state">
        没有符合筛选条件的单据
      </div>
      <article v-for="order in props.orders" v-else :key="order.id" class="sales-table__card">
        <header class="sales-table__card-header">
          <div class="sales-table__card-date">
            <span class="sales-table__card-label">单据日期</span>
            <strong>{{ order.date }}</strong>
          </div>
          <div class="sales-table__card-summary">
            <div class="sales-table__card-badges">
              <StatusBadge :label="typeLabel(order.type)" :tone="typeTone(order.type)" />
              <StatusBadge
                :label="order.status === 'voided' ? '已作废' : '正常'"
                :tone="order.status === 'voided' ? 'warning' : 'success'"
              />
              <StatusBadge
                v-if="order.source === 'shengma'"
                label="盛码"
                tone="info"
              />
            </div>
            <strong class="sales-table__card-amount">{{ formatMoney(order.totalAmount) }}</strong>
          </div>
        </header>

        <dl class="sales-table__card-grid">
          <div>
            <dt>售货机</dt>
            <dd>{{ order.machineId || '-' }}</dd>
          </div>
          <div>
            <dt>明细</dt>
            <dd>{{ order.items.length }} 项</dd>
          </div>
          <div>
            <dt>数量</dt>
            <dd>{{ formatQuantity(orderQuantity(order)) }}</dd>
          </div>
        </dl>

        <div class="sales-table__card-actions">
          <AppButton size="sm" variant="secondary" @click="emit('view', order)">
            查看
          </AppButton>
          <AppButton
            size="sm"
            variant="danger"
            :disabled="order.status === 'voided' || order.source === 'shengma'"
            @click="emit('void', order)"
          >
            作废
          </AppButton>
        </div>
      </article>
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
  min-width: 820px;
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

.sales-table__table th.sales-table__center,
.sales-table__table td.sales-table__center {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sales-table__table .sales-table__actions-cell {
  width: 148px;
}

.sales-table__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.sales-table__status {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
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

.sales-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .sales-table {
    border: 0;
    background: transparent;
  }

  .sales-table__scroll {
    display: none;
  }

  .sales-table__cards {
    display: grid;
    gap: var(--space-2);
  }

  .sales-table__card,
  .sales-table__card-state {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3);
    background: var(--color-surface);
  }

  .sales-table__card {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .sales-table__card-state {
    min-height: 112px;
    display: grid;
    place-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: var(--color-text-muted);
    text-align: center;
  }

  .sales-table__card-state--error {
    color: var(--color-danger);
  }

  .sales-table__card-header,
  .sales-table__card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .sales-table__card-date,
  .sales-table__card-summary {
    min-width: 0;
  }

  .sales-table__card-date strong {
    display: block;
    margin-top: 2px;
    font-size: 16px;
    line-height: 1.25;
  }

  .sales-table__card-summary {
    display: grid;
    justify-items: end;
    gap: 4px;
  }

  .sales-table__card-badges {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .sales-table__card-label,
  .sales-table__card-grid dt {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .sales-table__card-amount {
    color: var(--color-primary);
    font-size: 18px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .sales-table__card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    margin: 0;
  }

  .sales-table__card-grid div {
    min-width: 0;
    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-2);
    background: var(--color-surface-subtle);
  }

  .sales-table__card-grid dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--color-text);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .sales-table__card-actions {
    justify-content: stretch;
  }

  .sales-table__card-actions :deep(.app-button) {
    flex: 1 1 0;
  }
}
</style>
