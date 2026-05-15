<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { InventoryBalance, StockMovement, StockMovementType } from '~/types/inventory'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  balance?: InventoryBalance | null
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
  void: '作废'
}

function movementTone(type: StockMovementType) {
  if (type === 'purchase' || type === 'refund') return 'success'
  if (type === 'sale' || type === 'loss') return 'danger'
  if (type === 'adjustment') return 'info'
  return 'warning'
}

function quantityDeltaLabel(movement: StockMovement) {
  const delta = Number(movement.qtyDelta) || 0
  return `${delta > 0 ? '+' : ''}${formatQuantity(delta)}`
}
</script>

<template>
  <section class="movement-timeline" aria-label="库存流水时间线">
    <header class="movement-timeline__header">
      <div>
        <h2 class="movement-timeline__title">库存流水</h2>
        <p class="movement-timeline__description">
          {{ props.balance ? `${props.balance.productName} · ${props.balance.machineId}` : '选择一条库存余额查看流水' }}
        </p>
      </div>
      <StatusBadge label="stock_movements" tone="info" />
    </header>

    <div v-if="props.loading" class="movement-timeline__state">
      正在加载库存流水
    </div>
    <div v-else-if="props.error" class="movement-timeline__state movement-timeline__state--error">
      <strong>{{ props.error.message }}</strong>
      <AppButton variant="secondary" size="sm" @click="emit('retry')">
        重试
      </AppButton>
    </div>
    <div v-else-if="props.movements.length === 0" class="movement-timeline__state">
      暂无库存流水
    </div>
    <ol v-else class="movement-timeline__list">
      <li v-for="movement in props.movements" :key="movement.id" class="movement-timeline__item">
        <div class="movement-timeline__marker" aria-hidden="true" />
        <div class="movement-timeline__content">
          <div class="movement-timeline__item-head">
            <StatusBadge
              :label="movementLabels[movement.movementType] || movement.movementType"
              :tone="movementTone(movement.movementType)"
            />
            <strong :class="['movement-timeline__delta', Number(movement.qtyDelta) > 0 ? 'is-plus' : 'is-minus']">
              {{ quantityDeltaLabel(movement) }}
            </strong>
          </div>
          <div class="movement-timeline__meta">
            <span>{{ formatDateTime(movement.createdAt) }}</span>
            <span>{{ movement.productName || movement.productId }}</span>
            <span>{{ movement.machineId }}</span>
          </div>
          <div class="movement-timeline__meta">
            <span>{{ movement.refType }} / {{ movement.refId }}</span>
            <span>成本 {{ formatMoney(movement.unitCost) }}</span>
          </div>
          <p v-if="movement.reason" class="movement-timeline__reason">
            {{ movement.reason }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.movement-timeline {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.movement-timeline__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.movement-timeline__title {
  margin: 0;
  font-size: 17px;
}

.movement-timeline__description {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.movement-timeline__state {
  min-height: 220px;
  display: grid;
  place-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
}

.movement-timeline__state--error {
  color: var(--color-danger);
}

.movement-timeline__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.movement-timeline__item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: var(--space-3);
}

.movement-timeline__marker {
  width: 10px;
  height: 10px;
  margin-top: 14px;
  border: 2px solid var(--color-info);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: 0 0 0 4px var(--color-info-soft);
}

.movement-timeline__content {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.movement-timeline__item-head,
.movement-timeline__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.movement-timeline__meta {
  flex-wrap: wrap;
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
}

.movement-timeline__delta {
  font-variant-numeric: tabular-nums;
}

.movement-timeline__delta.is-plus {
  color: var(--color-inbound);
}

.movement-timeline__delta.is-minus {
  color: var(--color-outbound);
}

.movement-timeline__reason {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .movement-timeline {
    padding: var(--space-3);
  }

  .movement-timeline__header {
    display: grid;
  }
}
</style>
