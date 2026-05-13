<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: ''
})

const emit = defineEmits<{
  close: []
}>()

function closeDrawer() {
  open.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="app-drawer">
      <div v-if="open" class="app-drawer" role="presentation">
        <button class="app-drawer__backdrop" type="button" aria-label="关闭抽屉" @click="closeDrawer" />
        <aside class="app-drawer__panel" role="dialog" aria-modal="true" :aria-label="props.title">
          <header class="app-drawer__header">
            <div>
              <h2 class="app-drawer__title">{{ props.title }}</h2>
              <p v-if="props.description" class="app-drawer__description">
                {{ props.description }}
              </p>
            </div>
            <button class="app-drawer__close" type="button" aria-label="关闭抽屉" @click="closeDrawer">
              ×
            </button>
          </header>
          <div class="app-drawer__body">
            <slot />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-drawer {
  position: fixed;
  z-index: 48;
  inset: 0;
  display: flex;
  justify-content: flex-end;
}

.app-drawer__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(23 32 51 / 34%);
}

.app-drawer__panel {
  position: relative;
  width: min(480px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
}

.app-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.app-drawer__title {
  margin: 0;
  font-size: 18px;
}

.app-drawer__description {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.app-drawer__close {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.app-drawer__body {
  min-width: 0;
  overflow: auto;
  padding: var(--space-4);
}

.app-drawer-enter-active,
.app-drawer-leave-active {
  transition: opacity var(--transition-fast);
}

.app-drawer-enter-from,
.app-drawer-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .app-drawer {
    align-items: end;
  }

  .app-drawer__panel {
    width: 100%;
    height: min(82vh, 680px);
    border-radius: var(--radius-3) var(--radius-3) 0 0;
  }
}
</style>
