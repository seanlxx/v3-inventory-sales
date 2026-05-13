<script setup lang="ts">
import type { PurchaseOrder } from '~/types/purchase'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  order?: PurchaseOrder | null
  submitting?: boolean
}>()

const emit = defineEmits<{
  confirm: [order: PurchaseOrder]
}>()
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="作废进货单"
    :description="props.order ? `确认作废 ${props.order.id}` : '作废进货单'"
  >
    <div v-if="props.order" class="void-dialog">
      <p class="void-dialog__notice">
        作废不是删除。确认后服务端会为每条进货流水写入反向 void 流水，并回滚库存余额缓存。
      </p>

      <section class="void-dialog__impact">
        <h3>库存影响</h3>
        <ul>
          <li v-for="item in props.order.items" :key="item.id || item.productId">
            <span>{{ item.productName || item.productId }}</span>
            <strong>-{{ formatQuantity(item.quantity) }} 件</strong>
          </li>
        </ul>
      </section>

      <footer class="void-dialog__footer">
        <span>原单金额 {{ formatMoney(props.order.totalCost) }}</span>
        <div class="void-dialog__actions">
          <AppButton variant="secondary" @click="open = false">
            取消
          </AppButton>
          <AppButton variant="danger" :loading="props.submitting" @click="emit('confirm', props.order)">
            确认作废
          </AppButton>
        </div>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.void-dialog {
  display: grid;
  gap: var(--space-4);
}

.void-dialog__notice {
  margin: 0;
  border: 1px solid rgb(194 65 12 / 28%);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  line-height: 1.7;
}

.void-dialog__impact {
  display: grid;
  gap: var(--space-3);
}

.void-dialog__impact h3 {
  margin: 0;
  font-size: 16px;
}

.void-dialog__impact ul {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.void-dialog__impact li,
.void-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.void-dialog__impact li {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
}

.void-dialog__impact strong {
  color: var(--color-outbound);
  font-variant-numeric: tabular-nums;
}

.void-dialog__footer span {
  color: var(--color-text-muted);
}

.void-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .void-dialog__footer,
  .void-dialog__actions {
    display: grid;
  }
}
</style>
