<script setup lang="ts">
import type { PurchaseOrder } from '~/types/purchase'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  order?: PurchaseOrder | null
}>()

const emit = defineEmits<{
  void: [order: PurchaseOrder]
}>()
</script>

<template>
  <AppDrawer
    v-model:open="open"
    title="进货单详情"
    :description="props.order ? `${props.order.id} · ${props.order.status === 'voided' ? '已作废' : '正常'}` : '进货单详情'"
  >
    <div v-if="props.order" class="purchase-detail">
      <section class="purchase-detail__summary">
        <div>
          <span>进货日期</span>
          <strong>{{ props.order.date }}</strong>
        </div>
        <div>
          <span>商品数量</span>
          <strong>{{ formatQuantity(props.order.quantity) }} 件</strong>
        </div>
        <div>
          <span>总金额</span>
          <strong>{{ formatMoney(props.order.totalCost) }}</strong>
        </div>
      </section>

      <section class="purchase-detail__meta">
        <p><span>供应商</span>{{ props.order.source || '拼多多' }}</p>
        <p><span>售货机</span>{{ props.order.machineId || '-' }}</p>
        <p><span>创建时间</span>{{ formatDateTime(props.order.createdAt) }}</p>
        <p><span>备注</span>{{ props.order.note || '-' }}</p>
      </section>

      <section class="purchase-detail__impact">
        <h3>库存影响</h3>
        <ul>
          <li v-for="item in props.order.items" :key="item.id || item.productId">
            <span>{{ item.productName || item.productId }}</span>
            <strong>+{{ formatQuantity(item.quantity) }}</strong>
          </li>
        </ul>
      </section>

      <div class="purchase-detail__actions">
        <StatusBadge
          :label="props.order.status === 'voided' ? '已作废' : '作废会生成反向库存流水'"
          :tone="props.order.status === 'voided' ? 'warning' : 'info'"
        />
        <AppButton
          variant="danger"
          :disabled="props.order.status === 'voided'"
          @click="emit('void', props.order)"
        >
          作废进货单
        </AppButton>
      </div>
    </div>
  </AppDrawer>
</template>

<style scoped>
.purchase-detail {
  display: grid;
  gap: var(--space-4);
}

.purchase-detail__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.purchase-detail__summary div {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.purchase-detail__summary span,
.purchase-detail__meta span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.purchase-detail__summary strong {
  font-variant-numeric: tabular-nums;
}

.purchase-detail__meta {
  display: grid;
  gap: var(--space-2);
}

.purchase-detail__meta p {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0;
}

.purchase-detail__impact {
  display: grid;
  gap: var(--space-3);
}

.purchase-detail__impact h3 {
  margin: 0;
  font-size: 16px;
}

.purchase-detail__impact ul {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.purchase-detail__impact li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
}

.purchase-detail__impact strong {
  color: var(--color-inbound);
  font-variant-numeric: tabular-nums;
}

.purchase-detail__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

@media (max-width: 760px) {
  .purchase-detail__summary {
    grid-template-columns: 1fr;
  }

  .purchase-detail__actions {
    display: grid;
  }
}
</style>
