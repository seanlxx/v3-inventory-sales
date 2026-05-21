<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <section class="settings-section surface-panel">
    <header class="settings-section__header">
      <div>
        <h2 class="settings-section__title">{{ props.title }}</h2>
        <p v-if="props.description" class="settings-section__description">
          {{ props.description }}
        </p>
      </div>
      <slot name="aside" />
    </header>
    <div class="settings-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  min-width: 0;
  display: grid;
}

.settings-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.settings-section__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.settings-section__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.settings-section__body {
  min-width: 0;
  padding: var(--space-4);
}

@media (max-width: 760px) {
  .settings-section__header,
  .settings-section__body {
    padding: var(--space-3);
  }

  .settings-section__header {
    display: grid;
  }
}
</style>
