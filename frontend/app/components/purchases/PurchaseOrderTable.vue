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
            <td class="purchase-table__actions-cell">
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

    <div class="purchase-table__cards" aria-label="进货单移动列表">
      <div v-if="props.loading" class="purchase-table__card-state">
        正在加载进货单
      </div>
      <div v-else-if="props.error" class="purchase-table__card-state purchase-table__card-state--error">
        <strong>{{ props.error.message }}</strong>
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </div>
      <div v-else-if="props.orders.length === 0" class="purchase-table__card-state">
        没有符合筛选条件的进货单
      </div>
      <article v-for="order in props.orders" v-else :key="order.id" class="purchase-table__card">
        <header class="purchase-table__card-header">
          <div>
            <span class="purchase-table__card-label">进货日期</span>
            <strong>{{ order.date }}</strong>
          </div>
          <StatusBadge
            :label="order.status === 'voided' ? '已作废' : '正常'"
            :tone="order.status === 'voided' ? 'warning' : 'success'"
          />
        </header>

        <dl class="purchase-table__card-grid">
          <div>
            <dt>供应商</dt>
            <dd>{{ order.source || '拼多多' }}</dd>
          </div>
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
            <dd>{{ formatQuantity(order.quantity) }}</dd>
          </div>
          <div class="purchase-table__card-total">
            <dt>金额</dt>
            <dd>{{ formatMoney(order.totalCost) }}</dd>
          </div>
        </dl>

        <div class="purchase-table__card-actions">
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
      </article>
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

.purchase-table__table .purchase-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.purchase-table__table .purchase-table__actions-heading,
.purchase-table__table .purchase-table__actions-cell {
  text-align: right;
  width: 148px;
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

.purchase-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .purchase-table {
    border: 0;
    background: transparent;
  }

  .purchase-table__scroll {
    display: none;
  }

  .purchase-table__cards {
    display: grid;
    gap: var(--space-3);
  }

  .purchase-table__card,
  .purchase-table__card-state {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3);
    background: var(--color-surface);
  }

  .purchase-table__card {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .purchase-table__card-state {
    min-height: 112px;
    display: grid;
    place-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: var(--color-text-muted);
    text-align: center;
  }

  .purchase-table__card-state--error {
    color: var(--color-danger);
  }

  .purchase-table__card-header,
  .purchase-table__card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .purchase-table__card-header > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .purchase-table__card-header strong {
    font-size: 16px;
    line-height: 1.25;
  }

  .purchase-table__card-label,
  .purchase-table__card-grid dt {
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .purchase-table__card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .purchase-table__card-grid div {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    background: var(--color-surface-subtle);
  }

  .purchase-table__card-grid dt {
    flex-shrink: 0;
  }

  .purchase-table__card-grid dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--color-text);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .purchase-table__card-total {
    grid-column: 1 / -1;
  }

  .purchase-table__card-total dd {
    color: var(--color-primary);
    font-size: 18px;
  }

  .purchase-table__card-actions {
    justify-content: stretch;
  }

  .purchase-table__card-actions :deep(.app-button) {
    flex: 1 1 0;
  }
}
</style>
