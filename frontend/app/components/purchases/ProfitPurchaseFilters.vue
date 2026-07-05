<script setup lang="ts">
import type { ProfitPurchaseFilters } from '~/types/profit'

const props = defineProps<{
  filters: ProfitPurchaseFilters
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<ProfitPurchaseFilters>]
  refresh: []
}>()

function updateFilter(key: keyof ProfitPurchaseFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="profit-purchase-filters" aria-label="进货成本筛选">
    <AppInput
      :model-value="props.filters.search"
      class="profit-purchase-filters__search"
      label="搜索"
      type="search"
      placeholder="凭证号、商品、供应商、备注"
      @update:model-value="emit('updateFilters', { search: String($event) })"
    />

    <AppInput
      :model-value="props.filters.month"
      label="月份"
      type="text"
      placeholder="YYYY-MM"
      @update:model-value="emit('updateFilters', { month: String($event) })"
    />

    <label class="profit-purchase-filters__field">
      <span class="profit-purchase-filters__label">状态</span>
      <select
        class="profit-purchase-filters__select"
        :value="props.filters.status"
        @change="updateFilter('status', $event)"
      >
        <option value="active">有效</option>
        <option value="voided">已作废</option>
        <option value="all">全部</option>
      </select>
    </label>

    <div class="profit-purchase-filters__actions">
      <StatusBadge :label="`${props.resultCount} 条成本凭证`" tone="info" />
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.profit-purchase-filters {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(130px, 0.55fr) minmax(130px, 0.55fr) auto;
  gap: var(--space-3);
  align-items: end;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.profit-purchase-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-purchase-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-purchase-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.profit-purchase-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1120px) {
  .profit-purchase-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profit-purchase-filters__search,
  .profit-purchase-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .profit-purchase-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .profit-purchase-filters__search,
  .profit-purchase-filters__actions {
    grid-column: auto;
  }

  .profit-purchase-filters__select {
    min-height: var(--control-height-mobile);
  }

  .profit-purchase-filters__actions {
    justify-content: stretch;
  }

  .profit-purchase-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
