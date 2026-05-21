<script setup lang="ts">
const props = defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="mobile-data-row">
    <div class="mobile-data-row__main">
      <span class="mobile-data-row__title">{{ props.title }}</span>
      <span v-if="props.description" class="mobile-data-row__description">
        {{ props.description }}
      </span>
    </div>
    <div class="mobile-data-row__meta">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.mobile-data-row {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid var(--mobile-border);
  border-radius: var(--mobile-card-radius);
  background: var(--mobile-card-bg);
  box-shadow: 0 4px 9px rgb(23 32 51 / 3%);
}

.mobile-data-row__main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.mobile-data-row__title {
  min-width: 0;
  overflow: hidden;
  color: var(--mobile-text);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-data-row__description {
  min-width: 0;
  overflow: hidden;
  color: var(--mobile-muted);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-data-row__meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 22px;
}
</style>
