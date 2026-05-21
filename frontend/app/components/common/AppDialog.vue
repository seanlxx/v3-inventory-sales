<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

type DialogSize = 'default' | 'wide'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  size?: DialogSize
}>(), {
  description: '',
  size: 'default'
})

const emit = defineEmits<{
  close: []
}>()

function closeDialog() {
  open.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="app-dialog">
      <div v-if="open" class="app-dialog" role="presentation">
        <button class="app-dialog__backdrop" type="button" aria-label="关闭弹窗" @click="closeDialog" />
        <section
          class="app-dialog__panel"
          :class="`app-dialog__panel--${props.size}`"
          role="dialog"
          aria-modal="true"
          :aria-label="props.title"
        >
          <header class="app-dialog__header">
            <div>
              <h2 class="app-dialog__title">{{ props.title }}</h2>
              <p v-if="props.description" class="app-dialog__description">
                {{ props.description }}
              </p>
            </div>
            <button class="app-dialog__close" type="button" aria-label="关闭弹窗" @click="closeDialog">
              ×
            </button>
          </header>
          <div class="app-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="app-dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-6);
}

.app-dialog__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(23 32 51 / 42%);
}

.app-dialog__panel {
  position: relative;
  width: min(620px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
}

.app-dialog__panel--wide {
  width: min(980px, 100%);
}

.app-dialog__header,
.app-dialog__footer {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.app-dialog__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
  border-bottom: 0;
}

.app-dialog__title {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.app-dialog__description {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.app-dialog__header > div {
  min-width: 0;
}

.app-dialog__close {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.app-dialog__body {
  overflow: auto;
  padding: var(--space-4);
}

.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity var(--transition-fast);
}

.app-dialog-enter-from,
.app-dialog-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .app-dialog {
    align-items: end;
    padding: var(--space-3);
  }

  .app-dialog__panel {
    width: 100%;
    max-height: calc(100vh - 24px);
  }

  .app-dialog__header {
    align-items: flex-start;
    gap: var(--space-3);
  }

  .app-dialog__description {
    overflow-wrap: anywhere;
  }
}
</style>
