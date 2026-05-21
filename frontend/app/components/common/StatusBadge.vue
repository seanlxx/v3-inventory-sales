<script setup lang="ts">
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const props = withDefaults(defineProps<{
  label: string
  tone?: BadgeTone
}>(), {
  tone: 'neutral'
})
</script>

<template>
  <span class="status-badge" :class="`status-badge--${props.tone}`">
    {{ props.label }}
  </span>
</template>

<style scoped>
.status-badge {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 9px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.status-badge--neutral {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.status-badge--success {
  border-color: rgb(22 138 74 / 28%);
  background: var(--color-inbound-soft);
  color: var(--color-inbound);
}

.status-badge--warning {
  border-color: rgb(199 119 0 / 32%);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.status-badge--danger {
  border-color: rgb(194 65 12 / 28%);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.status-badge--info {
  border-color: rgb(15 118 110 / 26%);
  background: var(--color-info-soft);
  color: var(--color-info);
}

@media (max-width: 760px) {
  .status-badge {
    min-height: 22px;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 11px;
  }
}
</style>
