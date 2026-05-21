<script setup lang="ts">
type MobileCardAccent = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const props = withDefaults(defineProps<{
  accent?: MobileCardAccent
  interactive?: boolean
}>(), {
  accent: 'neutral',
  interactive: false
})

const cardClasses = computed(() => [
  'mobile-card',
  `mobile-card--${props.accent}`,
  {
    'mobile-card--interactive': props.interactive
  }
])
</script>

<template>
  <article :class="cardClasses">
    <slot />
  </article>
</template>

<style scoped>
.mobile-card {
  min-width: 0;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-card-radius);
  background: var(--mobile-card-bg);
  box-shadow: var(--mobile-card-shadow);
}

.mobile-card--primary {
  border-left: 3px solid var(--color-primary);
}

.mobile-card--success {
  border-left: 3px solid var(--color-inbound);
}

.mobile-card--warning {
  border-left: 3px solid var(--color-warning);
}

.mobile-card--danger {
  border-left: 3px solid var(--color-danger);
}

.mobile-card--info {
  border-left: 3px solid var(--color-info);
}

.mobile-card--interactive {
  cursor: pointer;
  transition: transform var(--transition-bounce), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.mobile-card--interactive:active {
  transform: scale(0.99);
}
</style>
