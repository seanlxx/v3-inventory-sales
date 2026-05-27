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

function selectAllMachines() {
  emit('updateFilters', { machineId: 'all' })
}

function selectFirstMachine() {
  if (props.filters.machineId !== 'all') return
  const machineId = props.machines[0]
  if (machineId) emit('updateFilters', { machineId })
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
    <div class="dashboard-filters__field">
      <span>口径</span>
      <div class="dashboard-filters__segments" role="group" aria-label="仪表盘口径">
        <button
          class="dashboard-filters__segment"
          :class="{ 'dashboard-filters__segment--active': props.filters.machineId === 'all' }"
          type="button"
          :aria-pressed="props.filters.machineId === 'all'"
          :disabled="props.loading"
          @click="selectAllMachines"
        >
          全机汇总
        </button>
        <button
          class="dashboard-filters__segment"
          :class="{ 'dashboard-filters__segment--active': props.filters.machineId !== 'all' }"
          type="button"
          :aria-pressed="props.filters.machineId !== 'all'"
          :disabled="props.loading || props.machines.length === 0"
          @click="selectFirstMachine"
        >
          按机切分
        </button>
      </div>
    </div>
    <AppButton variant="secondary" :loading="props.loading" @click="emit('refresh')">
      刷新
    </AppButton>
  </section>
</template>

<style scoped>
.dashboard-filters {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(150px, 1fr) minmax(180px, auto) auto;
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

.dashboard-filters__segments {
  min-height: var(--control-height);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 4px;
  background: var(--color-surface-muted);
}

.dashboard-filters__segment {
  min-width: 0;
  border: 0;
  border-radius: calc(var(--radius-2) - 2px);
  padding: 0 var(--space-2);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}

.dashboard-filters__segment--active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-inset);
}

.dashboard-filters__segment:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.dashboard-filters__control[type="month"] {
  -webkit-appearance: none;
  appearance: none;
}

@media (max-width: 900px) {
  .dashboard-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-filters__field:first-of-type,
  .dashboard-filters :deep(.app-button) {
    grid-column: 1 / -1;
  }

  .dashboard-filters :deep(.app-button) {
    justify-self: end;
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

  .dashboard-filters__segments {
    min-height: var(--control-height-mobile);
  }

  .dashboard-filters :deep(.app-button) {
    width: 100%;
  }
}
</style>
