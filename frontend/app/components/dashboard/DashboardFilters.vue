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

function updateField(key: keyof DashboardFilters, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  const value = key === 'days' ? Number(target.value) : target.value
  emit('updateFilters', { [key]: value })
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
      <span>趋势天数</span>
      <select
        class="dashboard-filters__control"
        :value="props.filters.days"
        @change="updateField('days', $event)"
      >
        <option :value="7">近 7 天</option>
        <option :value="14">近 14 天</option>
        <option :value="30">近 30 天</option>
      </select>
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
  grid-template-columns: repeat(3, minmax(150px, 1fr)) auto;
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
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
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
