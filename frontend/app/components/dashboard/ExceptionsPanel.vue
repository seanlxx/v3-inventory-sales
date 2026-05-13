<script setup lang="ts">
import type { DashboardException } from '~/types/report'
import { formatDateTime } from '~/utils/format'

const props = defineProps<{
  items: readonly DashboardException[]
  loading?: boolean
}>()

function toneFor(type: DashboardException['type']) {
  if (type === 'low_stock') return 'warning'
  if (type === 'void') return 'danger'
  return 'info'
}

function labelFor(type: DashboardException['type']) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  if (type === 'void') return '作废'
  return '低库存'
}
</script>

<template>
  <section class="exceptions-panel surface-panel" aria-label="最近异常">
    <header class="exceptions-panel__header">
      <div>
        <h2 class="exceptions-panel__title">最近异常</h2>
        <p class="exceptions-panel__description">退款、损耗、作废和低库存提醒</p>
      </div>
    </header>

    <div v-if="props.loading" class="exceptions-panel__empty">
      加载异常提醒
    </div>
    <div v-else-if="props.items.length === 0" class="exceptions-panel__empty">
      暂无异常提醒
    </div>
    <div v-else class="exceptions-panel__list">
      <article v-for="item in props.items" :key="item.id" class="exceptions-panel__item">
        <StatusBadge :label="labelFor(item.type)" :tone="toneFor(item.type)" />
        <div class="exceptions-panel__content">
          <strong>{{ item.title }}</strong>
          <span>{{ formatDateTime(item.occurredAt) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.exceptions-panel {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.exceptions-panel__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.exceptions-panel__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.exceptions-panel__empty {
  min-height: 160px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.exceptions-panel__list {
  display: grid;
  gap: var(--space-2);
}

.exceptions-panel__item {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.exceptions-panel__content {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.exceptions-panel__content span {
  color: var(--color-text-muted);
  font-size: 12px;
}

@media (max-width: 760px) {
  .exceptions-panel {
    padding: var(--space-3);
  }
}
</style>
