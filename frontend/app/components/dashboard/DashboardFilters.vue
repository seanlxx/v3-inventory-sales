<script setup lang="ts">
import type { DashboardFilters } from '~/types/report'

const props = defineProps<{
  filters: DashboardFilters
  machines: readonly string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  updateFilters: [filters: Partial<DashboardFilters>]
  refresh: []
}>()

type DashboardFilterField = 'month' | 'machineId'

function updateField(key: DashboardFilterField, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('updateFilters', { [key]: target.value })
}
</script>

<template>
  <section class="dashboard-filters surface-panel" aria-label="仪表盘筛选">
    <label class="dashboard-filters__field">
      <span>月份</span>
      <input
        class="dashboard-filters__control"
        type="month"
        :value="props.filters.month"
        @input="updateField('month', $event)"
      >
    </label>
    <label class="dashboard-filters__field">
      <span>售货机</span>
      <select
        class="dashboard-filters__control"
        :value="props.filters.machineId"
        @change="updateField('machineId', $event)"
      >
        <option value="all">全部售货机</option>
        <option v-for="machine in props.machines" :key="machine" :value="machine">
          {{ machine }}
        </option>
      </select>
    </label>
    <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
      刷新
    </AppButton>
  </section>
</template>

<style scoped>
.dashboard-filters {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr)) auto;
  gap: var(--space-3);
  align-items: end;
  padding: var(--space-4);
}

.dashboard-filters__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.dashboard-filters__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-filters__control {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.dashboard-filters__control[type="month"] {
  -webkit-appearance: none;
  appearance: none;
}

@media (max-width: 900px) {
  .dashboard-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .dashboard-filters {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .dashboard-filters__control {
    min-height: var(--control-height-mobile);
  }
}
</style>
