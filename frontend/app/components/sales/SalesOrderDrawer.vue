<script setup lang="ts">
import type { SalesOrder, SalesOrderType } from '~/types/sale'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'
import { displayMachineName } from '~/utils/machines'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  order: SalesOrder | null
}>()

const emit = defineEmits<{
  void: [order: SalesOrder]
}>()

function typeLabel(type?: SalesOrderType) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  return '销售'
}

function stockImpact(order: SalesOrder, quantity: number) {
  if (order.type === 'refund') return `库存增加 ${formatQuantity(quantity)}`
  return `库存减少 ${formatQuantity(quantity)}`
}
</script>

<template>
  <AppDrawer
    v-model:open="open"
    :title="props.order ? `${typeLabel(props.order.type)}详情` : '单据详情'"
    description="库存变化来自服务端 stock_movements。"
  >
    <div v-if="props.order" class="sales-drawer">
      <section class="sales-drawer__summary">
        <div>
          <span>单号</span>
          <strong>{{ props.order.id }}</strong>
        </div>
        <div>
          <span>日期</span>
          <strong>{{ props.order.date }}</strong>
        </div>
        <div>
          <span>售货机</span>
          <strong>{{ displayMachineName(props.order.machineId) }}</strong>
        </div>
        <div>
          <span>金额</span>
          <strong>{{ formatMoney(props.order.totalAmount) }}</strong>
        </div>
      </section>

      <section class="sales-drawer__meta">
        <StatusBadge
          :label="props.order.status === 'voided' ? '已作废' : '正常'"
          :tone="props.order.status === 'voided' ? 'warning' : 'success'"
        />
        <StatusBadge :label="typeLabel(props.order.type)" :tone="props.order.type === 'loss' ? 'danger' : props.order.type === 'refund' ? 'info' : 'success'" />
        <StatusBadge
          v-if="props.order.source === 'shengma'"
          label="盛码同步"
          tone="info"
        />
        <span>创建 {{ formatDateTime(props.order.createdAt) }}</span>
      </section>

      <div class="sales-drawer__items">
        <div v-for="item in props.order.items" :key="`${props.order.id}-${item.productId}`" class="sales-drawer__item">
          <div>
            <strong>{{ item.productName || item.productId }}</strong>
            <span>{{ stockImpact(props.order, item.quantity) }}</span>
          </div>
          <div>
            <strong>{{ formatQuantity(item.quantity) }}</strong>
            <span>{{ formatMoney(item.itemRevenue || 0) }}</span>
          </div>
        </div>
      </div>

      <p v-if="props.order.note" class="sales-drawer__note">
        {{ props.order.note }}
      </p>

      <AppButton
        variant="danger"
        :disabled="props.order.status === 'voided' || props.order.source === 'shengma'"
        @click="emit('void', props.order)"
      >
        作废单据
      </AppButton>
    </div>
  </AppDrawer>
</template>

<style scoped>
.sales-drawer {
  display: grid;
  gap: var(--space-4);
}

.sales-drawer__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-drawer__summary div {
  min-width: 0;
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
}

.sales-drawer__summary span,
.sales-drawer__meta span,
.sales-drawer__item span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.sales-drawer__summary strong {
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.sales-drawer__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.sales-drawer__items {
  display: grid;
  gap: var(--space-2);
}

.sales-drawer__item {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

.sales-drawer__item div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.sales-drawer__item div:last-child {
  text-align: right;
}

.sales-drawer__note {
  margin: 0;
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 520px) {
  .sales-drawer__summary {
    grid-template-columns: 1fr;
  }
}
</style>
