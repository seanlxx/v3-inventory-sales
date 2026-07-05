<script setup lang="ts">
import type { ProfitSalesFilters } from '~/types/profit'

const props = defineProps<{
  filters: ProfitSalesFilters
  machines: readonly string[]
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<ProfitSalesFilters>]
  refresh: []
  clearProductFilter: []
}>()

function updateFilter(key: keyof ProfitSalesFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="profit-sales-filters" aria-label="销售收入筛选">
    <AppInput
      :model-value="props.filters.search"
      class="profit-sales-filters__search"
      label="搜索"
      type="search"
      placeholder="记录号、商品、来源、备注"
      @update:model-value="emit('updateFilters', { search: String($event) })"
    />

    <AppInput
      :model-value="props.filters.month"
      label="月份"
      type="text"
      placeholder="YYYY-MM / 全部"
      @update:model-value="emit('updateFilters', { month: String($event) })"
    />

    <label class="profit-sales-filters__field">
      <span class="profit-sales-filters__label">类型</span>
      <select
        class="profit-sales-filters__select"
        :value="props.filters.type"
        @change="updateFilter('type', $event)"
      >
        <option value="all">全部</option>
        <option value="sale">销售</option>
        <option value="refund">退款</option>
        <option value="loss">损耗</option>
      </select>
    </label>

    <label class="profit-sales-filters__field">
      <span class="profit-sales-filters__label">设备</span>
      <select
        class="profit-sales-filters__select"
        :value="props.filters.machineId"
        @change="updateFilter('machineId', $event)"
      >
        <option value="all">全部</option>
        <option v-for="machine in props.machines" :key="machine" :value="machine">
          {{ machine }}
        </option>
      </select>
    </label>

    <label class="profit-sales-filters__field">
      <span class="profit-sales-filters__label">状态</span>
      <select
        class="profit-sales-filters__select"
        :value="props.filters.status"
        @change="updateFilter('status', $event)"
      >
        <option value="active">有效</option>
        <option value="voided">已作废</option>
        <option value="all">全部</option>
      </select>
    </label>

    <div class="profit-sales-filters__actions">
      <StatusBadge v-if="props.filters.productGlobalId" label="已按商品筛选" tone="warning" />
      <StatusBadge :label="`${props.resultCount} 条销售记录`" tone="info" />
      <AppButton
        v-if="props.filters.productGlobalId"
        variant="ghost"
        @click="emit('clearProductFilter')"
      >
        清除商品
      </AppButton>
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.profit-sales-filters {
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

.profit-sales-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-sales-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-sales-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.profit-sales-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1240px) {
  .profit-sales-filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .profit-sales-filters__search,
  .profit-sales-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .profit-sales-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .profit-sales-filters__search,
  .profit-sales-filters__actions {
    grid-column: auto;
  }

  .profit-sales-filters__select {
    min-height: var(--control-height-mobile);
  }

  .profit-sales-filters__actions {
    justify-content: stretch;
  }

  .profit-sales-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
