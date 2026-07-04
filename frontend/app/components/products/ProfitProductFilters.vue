<script setup lang="ts">
import type { ProfitProductFilters } from '~/types/profit'

const props = defineProps<{
  filters: ProfitProductFilters
  categories: readonly string[]
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<ProfitProductFilters>]
  refresh: []
}>()

function updateFilter(key: keyof ProfitProductFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="profit-product-filters" aria-label="全局商品筛选">
    <div class="profit-product-filters__field profit-product-filters__field--search">
      <AppInput
        :model-value="props.filters.search"
        label="搜索"
        type="search"
        placeholder="商品名、标准名、分类"
        @update:model-value="emit('updateFilters', { search: String($event) })"
      />
    </div>

    <label class="profit-product-filters__field">
      <span class="profit-product-filters__label">分类</span>
      <select
        class="profit-product-filters__select"
        :value="props.filters.category"
        @change="updateFilter('category', $event)"
      >
        <option value="all">全部分类</option>
        <option v-for="category in props.categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
    </label>

    <label class="profit-product-filters__field">
      <span class="profit-product-filters__label">状态</span>
      <select
        class="profit-product-filters__select"
        :value="props.filters.status"
        @change="updateFilter('status', $event)"
      >
        <option value="active">在售</option>
        <option value="archived">已归档</option>
        <option value="all">全部状态</option>
      </select>
    </label>

    <div class="profit-product-filters__actions">
      <StatusBadge :label="`${props.resultCount} 个全局商品`" tone="info" />
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.profit-product-filters {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(240px, 1.5fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) auto;
  gap: var(--space-3);
  align-items: end;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.profit-product-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-product-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-product-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.profit-product-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1040px) {
  .profit-product-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profit-product-filters__field--search,
  .profit-product-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .profit-product-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .profit-product-filters__field--search,
  .profit-product-filters__actions {
    grid-column: auto;
  }

  .profit-product-filters__select {
    min-height: var(--control-height-mobile);
  }

  .profit-product-filters__actions {
    justify-content: stretch;
  }

  .profit-product-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
