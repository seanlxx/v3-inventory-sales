<script setup lang="ts">
import type { SalesListFilters } from '~/types/sale'

const props = defineProps<{
  filters: SalesListFilters
  machines: readonly string[]
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<SalesListFilters>]
  refresh: []
  create: []
  aiReview: []
}>()

function updateFilter(key: keyof SalesListFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="sales-filters" aria-label="销售单筛选">
    <AppInput
      :model-value="props.filters.search"
      class="sales-filters__search"
      label="搜索"
      type="search"
      placeholder="单号、商品、备注"
      @update:model-value="emit('updateFilters', { search: String($event) })"
    />

    <AppInput
      :model-value="props.filters.month"
      label="月份"
      type="text"
      placeholder="YYYY-MM"
      @update:model-value="emit('updateFilters', { month: String($event) })"
    />

    <label class="sales-filters__field">
      <span class="sales-filters__label">类型</span>
      <select class="sales-filters__select" :value="props.filters.type" @change="updateFilter('type', $event)">
        <option value="all">全部</option>
        <option value="sale">销售</option>
        <option value="refund">退款</option>
        <option value="loss">损耗</option>
      </select>
    </label>

    <label class="sales-filters__field">
      <span class="sales-filters__label">售货机</span>
      <select class="sales-filters__select" :value="props.filters.machineId" @change="updateFilter('machineId', $event)">
        <option value="all">全部</option>
        <option v-for="machine in props.machines" :key="machine" :value="machine">
          {{ machine }}
        </option>
      </select>
    </label>

    <label class="sales-filters__field">
      <span class="sales-filters__label">状态</span>
      <select class="sales-filters__select" :value="props.filters.status" @change="updateFilter('status', $event)">
        <option value="active">正常</option>
        <option value="voided">已作废</option>
        <option value="all">全部</option>
      </select>
    </label>

    <div class="sales-filters__actions">
      <StatusBadge :label="`${props.resultCount} 张单据`" tone="info" />
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
      <AppButton variant="secondary" @click="emit('aiReview')">
        AI 销售识别
      </AppButton>
      <AppButton @click="emit('create')">
        新建单据
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.sales-filters {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) minmax(118px, 0.55fr) minmax(118px, 0.55fr) minmax(128px, 0.65fr) minmax(118px, 0.55fr) auto;
  gap: var(--space-3);
  align-items: end;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.sales-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sales-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.sales-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.sales-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1240px) {
  .sales-filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sales-filters__search,
  .sales-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .sales-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .sales-filters__search,
  .sales-filters__actions {
    grid-column: auto;
  }

  .sales-filters__select {
    min-height: var(--control-height-mobile);
  }

  .sales-filters__actions {
    justify-content: stretch;
  }

  .sales-filters__actions :deep(.app-button) {
    flex: 1 1 140px;
  }
}
</style>
