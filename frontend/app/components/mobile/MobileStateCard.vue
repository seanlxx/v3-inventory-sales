<script setup lang="ts">
type MobileStateTone = 'neutral' | 'danger'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  tone?: MobileStateTone
}>(), {
  tone: 'neutral'
})
</script>

<template>
  <MobileCard class="mobile-state-card" :class="`mobile-state-card--${props.tone}`">
    <strong>{{ props.title }}</strong>
    <p v-if="props.description">
      {{ props.description }}
    </p>
    <slot />
  </MobileCard>
</template>

<style scoped>
.mobile-state-card {
  min-height: 112px;
  display: grid;
  place-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  color: var(--mobile-muted);
  text-align: center;
}

.mobile-state-card strong {
  color: inherit;
}

.mobile-state-card p {
  margin: 0;
  line-height: 1.6;
}

.mobile-state-card--danger {
  color: var(--color-danger);
}
</style>
