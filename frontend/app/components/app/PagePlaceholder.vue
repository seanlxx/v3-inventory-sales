<script setup lang="ts">
type Props = {
  title: string
  description: string
  sections?: readonly string[]
}

const props = withDefaults(defineProps<Props>(), {
  sections: () => []
})
</script>

<template>
  <section class="page-placeholder">
    <div class="page-placeholder__header">
      <p class="page-placeholder__stage">页面骨架</p>
      <h2 class="page-placeholder__title">{{ props.title }}</h2>
      <p class="page-placeholder__description">{{ props.description }}</p>
    </div>

    <div class="page-placeholder__body">
      <div
        v-for="section in props.sections"
        :key="section"
        class="page-placeholder__row"
      >
        <span class="page-placeholder__row-dot" aria-hidden="true" />
        <span>{{ section }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-placeholder {
  max-width: 960px;
  display: grid;
  gap: 20px;
}

.page-placeholder__header {
  display: grid;
  gap: 8px;
}

.page-placeholder__stage {
  margin: 0;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
}

.page-placeholder__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.page-placeholder__description {
  max-width: 680px;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.page-placeholder__body {
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.page-placeholder__row {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

.page-placeholder__row:last-child {
  border-bottom: 0;
}

.page-placeholder__row-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--color-info);
}

@media (max-width: 760px) {
  .page-placeholder__title {
    font-size: 21px;
  }
}
</style>
