<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

const props = withDefaults(defineProps<{
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false
})

const buttonClasses = computed(() => [
  'app-button',
  `app-button--${props.variant}`,
  `app-button--${props.size}`,
  {
    'app-button--loading': props.loading
  }
])
</script>

<template>
  <button
    :class="buttonClasses"
    :type="props.type"
    :disabled="props.disabled || props.loading"
  >
    <span v-if="props.loading" class="app-button__spinner" aria-hidden="true" />
    <span class="app-button__content">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.app-button {
  min-height: var(--control-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-3);
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.app-button--sm {
  min-height: 34px;
  padding: 0 var(--space-3);
  font-size: 13px;
}

.app-button--primary {
  background: var(--color-primary);
  color: #ffffff;
}

.app-button--primary:hover:not(:disabled) {
  background: var(--color-primary-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.app-button--secondary {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.app-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-muted);
  border-color: var(--color-border-strong);
  transform: translateY(-1px);
}

.app-button--danger {
  background: var(--color-danger);
  color: #ffffff;
}

.app-button--ghost {
  background: transparent;
  color: var(--color-text-muted);
}

.app-button--ghost:hover:not(:disabled) {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-button__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 999px;
  animation: app-button-spin 780ms linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .app-button {
    min-height: var(--control-height-mobile);
    border-radius: var(--mobile-button-radius);
  }

  .app-button--primary {
    box-shadow: 0 4px 9px rgb(37 99 235 / 16%);
  }
}
</style>
