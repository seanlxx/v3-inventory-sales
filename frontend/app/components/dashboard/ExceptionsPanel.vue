<script setup lang="ts">
import type { DashboardException } from '~/types/report'
import { formatDateTime } from '~/utils/format'

const props = defineProps<{
  items: readonly DashboardException[]
  loading?: boolean
  title?: string
  description?: string
  emptyMessage?: string
}>()

const emit = defineEmits<{
  view: [item: DashboardException]
}>()

function toneFor(type: DashboardException['type']) {
  if (type === 'cost_gap') return 'warning'
  if (type === 'product_merge') return 'info'
  if (type === 'void') return 'danger'
  return 'info'
}

function labelFor(type: DashboardException['type']) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  if (type === 'void') return '作废'
  if (type === 'cost_gap') return '成本'
  if (type === 'product_merge') return '合并'
  return '异常'
}
</script>

<template>
  <section class="exceptions-panel surface-panel" aria-label="最近异常">
    <header class="exceptions-panel__header">
      <div>
        <h2 class="exceptions-panel__title">{{ props.title || '最近异常' }}</h2>
        <p class="exceptions-panel__description">{{ props.description || '退款、作废、成本和商品合并提醒' }}</p>
      </div>
    </header>

    <div v-if="props.loading" class="exceptions-panel__empty">
      加载异常提醒
    </div>
    <div v-else-if="props.items.length === 0" class="exceptions-panel__empty">
      {{ props.emptyMessage || '暂无异常提醒' }}
    </div>
    <div v-else class="exceptions-panel__list">
      <article v-for="item in props.items" :key="item.id" class="exceptions-panel__item">
        <StatusBadge :label="labelFor(item.type)" :tone="toneFor(item.type)" />
        <div class="exceptions-panel__content">
          <strong>{{ item.title }}</strong>
          <span>{{ formatDateTime(item.occurredAt) }}</span>
        </div>
        <AppButton
          v-if="item.refType === 'products_global' && item.refId"
          size="sm"
          variant="secondary"
          @click="emit('view', item)"
        >
          查看商品
        </AppButton>
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
  grid-template-columns: auto minmax(0, 1fr) auto;
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

  .exceptions-panel__item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .exceptions-panel__item :deep(.app-button) {
    grid-column: 1 / -1;
  }
}
</style>
