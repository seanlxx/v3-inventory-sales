<script setup lang="ts">
import type { PurchaseListFilters } from '~/types/purchase'

const props = defineProps<{
  filters: PurchaseListFilters
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<PurchaseListFilters>]
  refresh: []
  create: []
  aiReview: []
}>()

function updateFilter(key: keyof PurchaseListFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="purchase-filters" aria-label="进货单筛选">
    <AppInput
      :model-value="props.filters.search"
      class="purchase-filters__search"
      label="搜索"
      type="search"
      placeholder="单号、商品、供应商、备注"
      @update:model-value="emit('updateFilters', { search: String($event) })"
    />

    <AppInput
      :model-value="props.filters.month"
      label="月份"
      type="text"
      placeholder="YYYY-MM"
      @update:model-value="emit('updateFilters', { month: String($event) })"
    />

    <label class="purchase-filters__field">
      <span class="purchase-filters__label">状态</span>
      <select
        class="purchase-filters__select"
        :value="props.filters.status"
        @change="updateFilter('status', $event)"
      >
        <option value="active">正常</option>
        <option value="voided">已作废</option>
        <option value="all">全部</option>
      </select>
    </label>

    <div class="purchase-filters__actions">
      <StatusBadge :label="`${props.resultCount} 张单据`" tone="info" />
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
      <AppButton variant="secondary" @click="emit('aiReview')">
        AI 识别
      </AppButton>
      <AppButton @click="emit('create')">
        新建进货单
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.purchase-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(130px, 0.55fr) minmax(130px, 0.55fr) auto;
  gap: var(--space-3);
  align-items: end;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.purchase-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.purchase-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.purchase-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.purchase-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1120px) {
  .purchase-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .purchase-filters__search,
  .purchase-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .purchase-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .purchase-filters__search,
  .purchase-filters__actions {
    grid-column: auto;
  }

  .purchase-filters__select {
    min-height: var(--control-height-mobile);
  }

  .purchase-filters__actions {
    justify-content: stretch;
  }

  .purchase-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
