<script setup lang="ts">
import type { SalesOrderType } from '~/types/sale'

const props = defineProps<{
  modelValue: SalesOrderType
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SalesOrderType]
}>()

const modes: Array<{ value: SalesOrderType; label: string; description: string }> = [
  { value: 'sale', label: '销售', description: '出库并计销售收入' },
  { value: 'refund', label: '退款', description: '回补库存，不用负数销售' },
  { value: 'loss', label: '损耗', description: '报损出库，不计销售收入' }
]
</script>

<template>
  <section class="sales-modes" aria-label="业务类型">
    <button
      v-for="mode in modes"
      :key="mode.value"
      class="sales-modes__item"
      :class="{ 'sales-modes__item--active': props.modelValue === mode.value }"
      type="button"
      @click="emit('update:modelValue', mode.value)"
    >
      <strong>{{ mode.label }}</strong>
      <span>{{ mode.description }}</span>
    </button>
  </section>
</template>

<style scoped>
.sales-modes {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.sales-modes__item {
  min-width: 0;
  min-height: 72px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.sales-modes__item--active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.sales-modes__item strong {
  font-size: 15px;
}

.sales-modes__item span {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .sales-modes {
    grid-template-columns: 1fr;
  }
}
</style>
