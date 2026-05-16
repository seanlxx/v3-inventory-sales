<script setup lang="ts">
import type { ProductListFilters } from '~/types/product'

const props = defineProps<{
  filters: ProductListFilters
  machines: readonly string[]
  categories: readonly string[]
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<ProductListFilters>]
  refresh: []
  create: []
}>()

function updateFilter(key: keyof ProductListFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="product-filters" aria-label="商品筛选">
    <div class="product-filters__field product-filters__field--search">
      <AppInput
        :model-value="props.filters.search"
        label="搜索"
        type="search"
        placeholder="商品名、机器、分类"
        @update:model-value="emit('updateFilters', { search: String($event) })"
      />
    </div>

    <label class="product-filters__field">
      <span class="product-filters__label">售货机</span>
      <select
        class="product-filters__select"
        :value="props.filters.machineId"
        @change="updateFilter('machineId', $event)"
      >
        <option value="all">全部机器</option>
        <option v-for="machine in props.machines" :key="machine" :value="machine">
          {{ machine }}
        </option>
      </select>
    </label>

    <label class="product-filters__field">
      <span class="product-filters__label">分类</span>
      <select
        class="product-filters__select"
        :value="props.filters.category"
        @change="updateFilter('category', $event)"
      >
        <option value="all">全部分类</option>
        <option v-for="category in props.categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
    </label>

    <label class="product-filters__field">
      <span class="product-filters__label">状态</span>
      <select
        class="product-filters__select"
        :value="props.filters.status"
        @change="updateFilter('status', $event)"
      >
        <option value="active">在售</option>
        <option value="archived">已下架</option>
        <option value="all">全部状态</option>
      </select>
    </label>

    <div class="product-filters__actions">
      <StatusBadge :label="`${props.resultCount} 个商品`" tone="info" />
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
      <AppButton @click="emit('create')">
        新增商品
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.product-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) auto;
  gap: var(--space-3);
  align-items: end;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.product-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.product-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.product-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.product-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1120px) {
  .product-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-filters__field--search,
  .product-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .product-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .product-filters__field--search,
  .product-filters__actions {
    grid-column: auto;
  }

  .product-filters__select {
    min-height: var(--control-height-mobile);
  }

  .product-filters__actions {
    justify-content: stretch;
  }

  .product-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
