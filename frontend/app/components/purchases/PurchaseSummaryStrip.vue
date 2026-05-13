<script setup lang="ts">
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  totalCost: number
  quantity: number
  count: number
}>()
</script>

<template>
  <section class="purchase-summary" aria-label="进货汇总">
    <div class="purchase-summary__item">
      <span>进货总额</span>
      <strong>{{ formatMoney(props.totalCost) }}</strong>
    </div>
    <div class="purchase-summary__item">
      <span>入库数量</span>
      <strong>{{ formatQuantity(props.quantity) }} 件</strong>
    </div>
    <div class="purchase-summary__item">
      <span>进货单数</span>
      <strong>{{ formatQuantity(props.count) }} 张</strong>
    </div>
  </section>
</template>

<style scoped>
.purchase-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.purchase-summary__item {
  display: grid;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.purchase-summary__item span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.purchase-summary__item strong {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .purchase-summary {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }

  .purchase-summary__item {
    padding: var(--space-3);
  }

  .purchase-summary__item strong {
    font-size: 18px;
  }
}
</style>
