<script setup lang="ts">
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  salesAmount: number
  refundAmount: number
  lossQuantity: number
  count: number
}>()

const cards = computed(() => [
  { label: '销售金额', value: formatMoney(props.salesAmount), tone: 'sale' },
  { label: '退款金额', value: formatMoney(props.refundAmount), tone: 'refund' },
  { label: '损耗数量', value: formatQuantity(props.lossQuantity), tone: 'loss' },
  { label: '有效单据', value: `${formatQuantity(props.count)} 张`, tone: 'neutral' }
])
</script>

<template>
  <section class="sales-summary" aria-label="销售汇总">
    <article v-for="card in cards" :key="card.label" class="sales-summary__item" :class="`sales-summary__item--${card.tone}`">
      <span>{{ card.label }}</span>
      <strong>{{ card.value }}</strong>
    </article>
  </section>
</template>

<style scoped>
.sales-summary {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-summary__item {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.sales-summary__item span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.sales-summary__item strong {
  overflow-wrap: anywhere;
  font-size: 22px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.sales-summary__item--sale {
  border-color: rgb(22 138 74 / 24%);
}

.sales-summary__item--refund {
  border-color: rgb(15 118 110 / 24%);
}

.sales-summary__item--loss {
  border-color: rgb(194 65 12 / 24%);
}

@media (max-width: 980px) {
  .sales-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .sales-summary {
    grid-template-columns: 1fr;
  }

  .sales-summary__item {
    padding: var(--space-3);
  }
}
</style>
