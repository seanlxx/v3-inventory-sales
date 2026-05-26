<script setup lang="ts">
import { useClipboardImagePaste } from '~/composables/useClipboardImagePaste'

type ReviewImage = {
  id: string
  fileName: string
  previewUrl: string
}

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  title: string
  description: string
  uploadTitle: string
  uploadHint: string
  emptyMessage: string
  totalLabel?: string
  totalValue: string
  candidatesCount: number
  columns: readonly string[]
  images?: readonly ReviewImage[]
  recognizing?: boolean
  submitting?: boolean
  progressMessage?: string
  errorMessage?: string
  formError?: string
  pasteFileNamePrefix: string
  clearLabel?: string
  confirmLabel: string
}>(), {
  images: () => [],
  totalLabel: '合计',
  clearLabel: '清空图片',
  progressMessage: '',
  errorMessage: '',
  formError: ''
})

const emit = defineEmits<{
  imageSelected: [files: File[]]
  imageRemoved: [id: string]
  clear: []
  recognize: []
  addManual: []
  confirm: []
}>()

const previewImage = shallowRef<ReviewImage | null>(null)

const combinedError = computed(() => props.errorMessage || props.formError || '')
const hasImages = computed(() => props.images.length > 0)

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length > 0) emit('imageSelected', files)
  input.value = ''
}

function openImagePreview(image: ReviewImage) {
  previewImage.value = image
}

function closeImagePreview() {
  previewImage.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) closeImagePreview()
})

useClipboardImagePaste({
  enabled: open,
  fileNamePrefix: props.pasteFileNamePrefix,
  onImage: (file: File) => emit('imageSelected', [file])
})
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="props.title"
    :description="props.description"
    size="wide"
  >
    <div class="ai-recognition">
      <div class="ai-recognition__top">
        <label class="ai-recognition__upload" :class="{ 'is-active': hasImages }">
          <div class="ai-recognition__upload-main">
            <div class="ai-recognition__upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div class="ai-recognition__upload-text">
              <span class="ai-recognition__upload-title">{{ props.uploadTitle }}</span>
              <strong class="ai-recognition__upload-hint">
                {{ hasImages ? `已选择 ${props.images.length} 张图片，可继续多选或 Ctrl+V 粘贴` : props.uploadHint }}
              </strong>
            </div>
            <input type="file" accept="image/*" class="ai-recognition__upload-input" multiple @change="handleFileChange">
          </div>
          <div class="ai-recognition__preview-area">
            <div v-if="hasImages" class="ai-recognition__previews" aria-label="待识别图片">
              <article
                v-for="image in props.images"
                :key="image.id"
                class="ai-recognition__preview"
                role="button"
                tabindex="0"
                :aria-label="`放大预览 ${image.fileName}`"
                @click.prevent="openImagePreview(image)"
                @keydown.enter.prevent="openImagePreview(image)"
                @keydown.space.prevent="openImagePreview(image)"
              >
                <img :src="image.previewUrl" :alt="image.fileName">
                <button
                  type="button"
                  class="ai-recognition__preview-remove"
                  :disabled="props.recognizing"
                  :aria-label="`移除 ${image.fileName}`"
                  @click.stop.prevent="emit('imageRemoved', image.id)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <span class="ai-recognition__preview-name">{{ image.fileName }}</span>
              </article>
            </div>
          </div>
        </label>
        <AppButton
          variant="secondary"
          :loading="props.recognizing"
          :disabled="!hasImages"
          @click="emit('recognize')"
        >
          开始识别
        </AppButton>
      </div>

      <p v-if="props.recognizing || props.progressMessage" class="ai-recognition__progress">
        {{ props.progressMessage || 'AI 正在识别图片...' }}
      </p>

      <div class="ai-recognition__fields">
        <slot name="fields" />
      </div>

      <p v-if="combinedError" class="ai-recognition__error">
        {{ combinedError }}
      </p>

      <div class="ai-recognition__toolbar">
        <AppButton variant="secondary" @click="emit('addManual')">
          + 手动添加商品
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="props.recognizing || (!hasImages && props.candidatesCount === 0)"
          @click="emit('clear')"
        >
          {{ props.clearLabel }}
        </AppButton>
      </div>

      <div class="ai-recognition__scroll">
        <table class="ai-recognition__table">
          <thead>
            <tr>
              <th
                v-for="column in props.columns"
                :key="column"
                scope="col"
                :class="{
                  'ai-recognition__raw-col': column === '识别名称',
                  'ai-recognition__product-col': column === '匹配商品',
                  'ai-recognition__badge-col': column === '置信度' || column === '异常',
                  'ai-recognition__action-col': column === '操作',
                  'ai-recognition__number': ['库存', '数量', '单价', '小计'].includes(column)
                }"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="props.candidatesCount === 0">
              <td class="ai-recognition__empty" :colspan="props.columns.length">
                {{ props.emptyMessage }}
              </td>
            </tr>
            <slot v-else name="rows" />
          </tbody>
        </table>
      </div>

      <footer class="ai-recognition__footer">
        <p>
          {{ props.totalLabel }} <strong>{{ props.totalValue }}</strong>
        </p>
        <div class="ai-recognition__actions">
          <AppButton variant="secondary" @click="open = false">
            取消
          </AppButton>
          <AppButton :loading="props.submitting" :disabled="props.candidatesCount === 0" @click="emit('confirm')">
            {{ props.confirmLabel }}
          </AppButton>
        </div>
      </footer>

      <div
        v-if="previewImage"
        class="ai-recognition__image-lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="`预览 ${previewImage.fileName}`"
        @click.self="closeImagePreview"
      >
        <div class="ai-recognition__image-panel">
          <header class="ai-recognition__image-header">
            <strong>{{ previewImage.fileName }}</strong>
            <button type="button" aria-label="关闭预览" @click="closeImagePreview">
              关闭
            </button>
          </header>
          <img :src="previewImage.previewUrl" :alt="previewImage.fileName">
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.ai-recognition {
  min-width: 0;
  display: grid;
  gap: var(--space-5);
}

.ai-recognition__top,
.ai-recognition__actions {
  min-width: 0;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: var(--space-3);
}

.ai-recognition__upload {
  position: relative;
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(320px, 0.95fr);
  align-items: stretch;
  gap: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-4);
  padding: var(--space-4);
  background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.ai-recognition__upload:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-card-hover);
}

.ai-recognition__upload.is-active {
  border-color: var(--color-primary);
  background: linear-gradient(180deg, var(--color-primary-soft) 0%, var(--color-surface) 60%);
}

.ai-recognition__upload-main {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.ai-recognition__upload-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.ai-recognition__upload-icon svg {
  width: 22px;
  height: 22px;
}

.ai-recognition__upload-text {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.ai-recognition__upload-title {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ai-recognition__upload-hint {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.ai-recognition__upload-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.ai-recognition__preview-area {
  min-width: 0;
}

.ai-recognition__previews {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: var(--space-2);
}

.ai-recognition__preview {
  position: relative;
  min-width: 0;
  display: grid;
  gap: 6px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  overflow: hidden;
  cursor: zoom-in;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.ai-recognition__preview:hover,
.ai-recognition__preview:focus-visible {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
  outline: none;
}

.ai-recognition__preview img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--color-surface-subtle);
  display: block;
}

.ai-recognition__preview-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.ai-recognition__preview-remove svg {
  width: 14px;
  height: 14px;
}

.ai-recognition__preview-remove:hover:not(:disabled) {
  background: var(--color-danger);
  transform: scale(1.06);
}

.ai-recognition__preview-remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-recognition__preview-name {
  display: block;
  padding: 0 var(--space-2) var(--space-2);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-recognition__fields {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.ai-recognition__progress {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-primary-soft);
  border-radius: var(--radius-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
  font-size: 13px;
  font-weight: 600;
}

.ai-recognition__error {
  margin: 0;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 600;
}

.ai-recognition__toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: var(--space-2);
}

.ai-recognition__scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.ai-recognition__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.ai-recognition__table :deep(th),
.ai-recognition__table :deep(td) {
  height: 56px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.ai-recognition__table :deep(th) {
  position: sticky;
  top: 0;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ai-recognition__table :deep(tbody tr) {
  transition: background var(--transition-fast);
}

.ai-recognition__table :deep(tbody tr:nth-child(even)) {
  background: var(--color-surface-subtle);
}

.ai-recognition__table :deep(tbody tr:hover) {
  background: var(--color-primary-soft);
}

.ai-recognition__number,
.ai-recognition__table :deep(.ai-recognition__number) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ai-recognition__raw-col {
  width: 22%;
}

.ai-recognition__product-col {
  width: 25%;
}

.ai-recognition__table :deep(td.ai-recognition__product-cell) {
  overflow: visible;
  position: relative;
  z-index: 1;
}

.ai-recognition__table :deep(td.ai-recognition__product-cell:focus-within) {
  z-index: 20;
}

.ai-recognition__badge-col {
  width: 76px;
}

.ai-recognition__action-col {
  width: 72px;
}

.ai-recognition__table :deep(.ai-recognition__input) {
  width: 100%;
  max-width: 88px;
  min-width: 0;
  min-height: 36px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.ai-recognition__table :deep(.ai-recognition__input:focus) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
  outline: none;
}

.ai-recognition__table :deep(.ai-recognition__input--name) {
  max-width: none;
  text-align: left;
}

.ai-recognition__table :deep(.ai-recognition__new-product) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.ai-recognition__table :deep(.ai-recognition__matched-name) {
  display: none;
}

.ai-recognition__empty {
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
  font-size: 13px;
}

.ai-recognition__table :deep(.ai-recognition__action-cell) {
  text-align: center;
}

.ai-recognition__table :deep(.ai-recognition__remove) {
  display: inline-grid;
  place-items: center;
  min-width: 32px;
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-2);
  padding: 0 10px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.ai-recognition__table :deep(.ai-recognition__remove:hover) {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.ai-recognition__table :deep(tbody tr:last-child td) {
  border-bottom: 0;
}

.ai-recognition__footer {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: linear-gradient(180deg, var(--color-surface-subtle) 0%, var(--color-surface) 100%);
}

.ai-recognition__footer p {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ai-recognition__footer strong {
  color: var(--color-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.ai-recognition__image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ai-recognition__image-panel {
  width: min(920px, 100%);
  max-height: min(82vh, 920px);
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-radius: var(--radius-4);
  background: var(--color-surface);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.32);
}

.ai-recognition__image-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.ai-recognition__image-header strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-recognition__image-header button {
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.ai-recognition__image-panel img {
  width: 100%;
  max-height: calc(min(82vh, 920px) - 62px);
  display: block;
  object-fit: contain;
  background: var(--color-surface-subtle);
}

@media (max-width: 760px) {
  .ai-recognition {
    gap: var(--space-4);
  }

  .ai-recognition__top,
  .ai-recognition__actions {
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    justify-content: stretch;
  }

  .ai-recognition__upload {
    grid-template-columns: 1fr;
    padding: var(--space-3);
  }

  .ai-recognition__upload,
  .ai-recognition__top :deep(.app-button),
  .ai-recognition__actions :deep(.app-button) {
    width: 100%;
  }

  .ai-recognition__previews {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ai-recognition__scroll {
    overflow-x: visible;
    border: 0;
    background: transparent;
  }

  .ai-recognition__table,
  .ai-recognition__table :deep(tbody),
  .ai-recognition__table :deep(tr),
  .ai-recognition__table :deep(td) {
    display: block;
  }

  .ai-recognition__table {
    table-layout: auto;
  }

  .ai-recognition__table thead {
    display: none;
  }

  .ai-recognition__table :deep(tbody) {
    display: grid;
    gap: var(--space-3);
  }

  .ai-recognition__table :deep(tr) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3);
    background: var(--color-surface);
    box-shadow: var(--shadow-card-hover);
  }

  .ai-recognition__table :deep(tbody tr:nth-child(even)),
  .ai-recognition__table :deep(tbody tr:hover) {
    background: var(--color-surface);
  }

  .ai-recognition__table :deep(td) {
    min-width: 0;
    height: auto;
    padding: 0;
    border-bottom: 0;
    white-space: normal;
    overflow: visible;
  }

  .ai-recognition__table :deep(td::before) {
    content: attr(data-label);
    display: block;
    margin-bottom: 4px;
    color: var(--color-text-soft);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .ai-recognition__number,
  .ai-recognition__table :deep(.ai-recognition__number) {
    text-align: left;
  }

  .ai-recognition__table :deep(.ai-recognition__name-cell),
  .ai-recognition__table :deep(.ai-recognition__product-cell),
  .ai-recognition__empty {
    grid-column: 1 / -1;
  }

  .ai-recognition__table :deep(.ai-recognition__action-cell) {
    grid-column: 1 / -1;
    text-align: left;
  }

  .ai-recognition__table :deep(.ai-recognition__remove) {
    width: 100%;
    min-height: 44px;
  }

  .ai-recognition__table :deep(.ai-recognition__input) {
    max-width: none;
    min-height: var(--control-height-mobile);
    text-align: left;
  }

  .ai-recognition__table :deep(.ai-recognition__new-product) {
    grid-template-columns: 1fr;
  }

  .ai-recognition__footer {
    position: sticky;
    bottom: calc(-1 * var(--space-4));
    margin: 0 calc(-1 * var(--space-4));
    grid-template-columns: 1fr;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border: 0;
    border-top: 1px solid var(--color-border);
    border-radius: 0;
    background: var(--color-surface);
  }

  .ai-recognition__footer p {
    text-align: left;
  }

  .ai-recognition__image-lightbox {
    padding: var(--space-3);
  }

  .ai-recognition__image-panel {
    max-height: 86vh;
  }

  .ai-recognition__image-panel img {
    max-height: calc(86vh - 58px);
  }
}
</style>
