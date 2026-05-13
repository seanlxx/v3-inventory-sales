<script setup lang="ts">
import type { SalesOrder } from '~/types/sale'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  order: SalesOrder | null
  submitting?: boolean
}>()

const emit = defineEmits<{
  confirm: [order: SalesOrder]
}>()

function typeLabel(order: SalesOrder) {
  if (order.type === 'refund') return '退款'
  if (order.type === 'loss') return '损耗'
  return '销售'
}

function impactLabel(order: SalesOrder, quantity: number) {
  if (order.type === 'refund') return `作废后库存减少 ${formatQuantity(quantity)}`
  return `作废后库存回补 ${formatQuantity(quantity)}`
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="作废单据"
    description="作废不会删除历史，会由后端写入反向库存流水。"
  >
    <div v-if="props.order" class="sales-void">
      <div class="sales-void__summary">
        <span>{{ typeLabel(props.order) }}单</span>
        <strong>{{ props.order.id }}</strong>
        <span>{{ props.order.date }} · {{ formatMoney(props.order.totalAmount) }}</span>
      </div>

      <div class="sales-void__items">
        <div v-for="item in props.order.items" :key="`${props.order.id}-${item.productId}`" class="sales-void__item">
          <span>{{ item.productName || item.productId }}</span>
          <strong>{{ impactLabel(props.order, item.quantity) }}</strong>
        </div>
      </div>

      <div class="sales-void__actions">
        <AppButton variant="secondary" @click="open = false">
          取消
        </AppButton>
        <AppButton variant="danger" :loading="props.submitting" @click="emit('confirm', props.order)">
          确认作废
        </AppButton>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.sales-void {
  display: grid;
  gap: var(--space-4);
}

.sales-void__summary {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.sales-void__summary span,
.sales-void__item span {
  color: var(--color-text-muted);
}

.sales-void__summary strong {
  overflow-wrap: anywhere;
}

.sales-void__items {
  display: grid;
  gap: var(--space-2);
}

.sales-void__item {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

.sales-void__item strong {
  color: var(--color-danger);
  font-size: 13px;
  white-space: nowrap;
}

.sales-void__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 520px) {
  .sales-void__item,
  .sales-void__actions {
    display: grid;
  }

  .sales-void__item strong {
    white-space: normal;
  }
}
</style>
