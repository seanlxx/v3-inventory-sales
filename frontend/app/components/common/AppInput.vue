<script setup lang="ts">
const model = defineModel<string | number>({ default: '' })

const props = withDefaults(defineProps<{
  id?: string
  label: string
  type?: 'text' | 'search' | 'number' | 'password' | 'date' | 'time'
  placeholder?: string
  hint?: string
  error?: string
  autocomplete?: string
  step?: string | number
  disabled?: boolean
  readonly?: boolean
}>(), {
  type: 'text',
  placeholder: '',
  hint: '',
  error: '',
  autocomplete: '',
  step: undefined,
  disabled: false,
  readonly: false
})

const inputId = computed(() => props.id || `input-${props.label.replace(/\s+/g, '-').toLowerCase()}`)
</script>

<template>
  <label class="app-input" :for="inputId">
    <span class="app-input__label">{{ props.label }}</span>
    <input
      :id="inputId"
      v-model="model"
      class="app-input__control"
      :type="props.type"
      :placeholder="props.placeholder"
      :autocomplete="props.autocomplete || undefined"
      :step="props.step"
      :disabled="props.disabled"
      :readonly="props.readonly"
      :aria-invalid="props.error ? 'true' : 'false'"
    >
    <span v-if="props.error" class="app-input__message app-input__message--error">
      {{ props.error }}
    </span>
    <span v-else-if="props.hint" class="app-input__message">
      {{ props.hint }}
    </span>
  </label>
</template>

<style scoped>
.app-input {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.app-input__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.app-input__control {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.app-input__control[type="date"] {
  -webkit-appearance: none;
  appearance: none;
}

.app-input__control::placeholder {
  color: var(--color-text-soft);
}

.app-input__control:disabled,
.app-input__control:read-only {
  background: var(--color-surface-muted);
}

.app-input__control[aria-invalid="true"] {
  border-color: var(--color-danger);
}

.app-input__message {
  min-height: 16px;
  color: var(--color-text-soft);
  font-size: 12px;
}

.app-input__message--error {
  color: var(--color-danger);
}

@media (max-width: 760px) {
  .app-input__control {
    min-height: var(--control-height-mobile);
  }
}
</style>
