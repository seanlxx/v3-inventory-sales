<script setup lang="ts">
import type { InventoryListFilters } from '~/types/inventory'

const props = defineProps<{
  filters: InventoryListFilters
  categories: readonly string[]
  resultCount: number
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<InventoryListFilters>]
  refresh: []
  cycleCount: []
}>()

function updateFilter(key: keyof InventoryListFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value })
}
</script>

<template>
  <section class="inventory-filters" aria-label="库存筛选">
    <div class="inventory-filters__field inventory-filters__field--search">
      <AppInput
        :model-value="props.filters.search"
        label="搜索"
        type="search"
        placeholder="商品、编号、分类"
        @update:model-value="emit('updateFilters', { search: String($event) })"
      />
    </div>

    <label class="inventory-filters__field">
      <span class="inventory-filters__label">分类</span>
      <select
        class="inventory-filters__select"
        :value="props.filters.category"
        @change="updateFilter('category', $event)"
      >
        <option value="all">全部分类</option>
        <option v-for="category in props.categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
    </label>

    <label class="inventory-filters__toggle">
      <input
        type="checkbox"
        :checked="props.filters.lowStock"
        @change="updateFilter('lowStock', $event)"
      >
      <span>仅低库存</span>
    </label>

    <div class="inventory-filters__actions">
      <StatusBadge :label="`${props.resultCount} 个商品`" tone="info" />
      <AppButton variant="secondary" @click="emit('cycleCount')">
        现场盘点
      </AppButton>
      <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
        刷新
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.inventory-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.3fr) minmax(140px, 0.65fr) auto auto;
  gap: var(--space-3);
  align-items: end;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.inventory-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.inventory-filters__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.inventory-filters__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.inventory-filters__toggle {
  min-height: var(--control-height);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-weight: 700;
  white-space: nowrap;
}

.inventory-filters__toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.inventory-filters__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1120px) {
  .inventory-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inventory-filters__field--search,
  .inventory-filters__actions {
    grid-column: 1 / -1;
  }

  .inventory-filters__toggle {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .inventory-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .inventory-filters__field--search,
  .inventory-filters__actions {
    grid-column: auto;
  }

  .inventory-filters__select,
  .inventory-filters__toggle {
    min-height: var(--control-height-mobile);
  }

  .inventory-filters__actions {
    justify-content: stretch;
  }

  .inventory-filters__actions :deep(.app-button) {
    flex: 1 1 132px;
  }
}
</style>
