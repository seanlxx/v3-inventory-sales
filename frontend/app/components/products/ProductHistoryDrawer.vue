<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { StockMovement, StockMovementType } from '~/types/inventory'
import type { Product } from '~/types/product'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  product?: Product | null
  movements: readonly StockMovement[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  retry: []
}>()

const movementLabels: Record<StockMovementType, string> = {
  purchase: '进货',
  sale: '销售',
  refund: '退款',
  loss: '损耗',
  adjustment: '盘点',
  void: '作废',
  transfer_out: '调出',
  transfer_in: '调入'
}

function movementTone(type: StockMovementType) {
  if (type === 'purchase' || type === 'refund' || type === 'transfer_in') return 'success'
  if (type === 'sale' || type === 'loss' || type === 'transfer_out') return 'danger'
  if (type === 'adjustment') return 'info'
  return 'warning'
}

function quantityDeltaLabel(movement: StockMovement) {
  const delta = Number(movement.qtyDelta) || 0
  return `${delta > 0 ? '+' : ''}${formatQuantity(delta)}`
}

const displayCost = computed(() =>
  Number(props.product?.purchaseAvgCost) || Number(props.product?.avgCost) || 0
)
</script>

<template>
  <AppDrawer
    v-model:open="open"
    title="商品流水"
    :description="props.product ? `${props.product.name} · 库存只读，来源为 stock_movements` : '库存流水'"
  >
    <div v-if="props.product" class="product-history__summary">
      <div>
        <span>当前库存</span>
        <strong>{{ formatQuantity(props.product.currentStock) }} 件</strong>
      </div>
      <div>
        <span>售价</span>
        <strong>{{ formatMoney(props.product.sellPrice) }}</strong>
      </div>
      <div>
        <span>进货价</span>
        <strong>{{ formatMoney(displayCost) }}</strong>
      </div>
    </div>

    <div v-if="props.loading" class="product-history__state">
      正在加载库存流水
    </div>
    <div v-else-if="props.error" class="product-history__state product-history__state--error">
      <strong>{{ props.error.message }}</strong>
      <AppButton variant="secondary" size="sm" @click="emit('retry')">
        重试
      </AppButton>
    </div>
    <div v-else-if="props.movements.length === 0" class="product-history__state">
      暂无库存流水
    </div>
    <ol v-else class="product-history__timeline">
      <li v-for="movement in props.movements" :key="movement.id" class="product-history__item">
        <div class="product-history__item-head">
          <StatusBadge
            :label="movementLabels[movement.movementType] || movement.movementType"
            :tone="movementTone(movement.movementType)"
          />
          <strong :class="['product-history__delta', Number(movement.qtyDelta) > 0 ? 'is-plus' : 'is-minus']">
            {{ quantityDeltaLabel(movement) }}
          </strong>
        </div>
        <div class="product-history__meta">
          <span>{{ formatDateTime(movement.createdAt) }}</span>
          <span>{{ movement.machineId }}</span>
          <span>{{ movement.refType }} / {{ movement.refId }}</span>
        </div>
      </li>
    </ol>
  </AppDrawer>
</template>

<style scoped>
.product-history__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.product-history__summary div {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.product-history__summary span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.product-history__summary strong,
.product-history__delta {
  font-variant-numeric: tabular-nums;
}

.product-history__state {
  min-height: 160px;
  display: grid;
  place-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
}

.product-history__state--error {
  color: var(--color-danger);
}

.product-history__timeline {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.product-history__item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface);
}

.product-history__item-head,
.product-history__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.product-history__meta {
  flex-wrap: wrap;
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
}

.product-history__delta.is-plus {
  color: var(--color-inbound);
}

.product-history__delta.is-minus {
  color: var(--color-outbound);
}

@media (max-width: 760px) {
  .product-history__summary {
    grid-template-columns: 1fr;
  }
}
</style>
