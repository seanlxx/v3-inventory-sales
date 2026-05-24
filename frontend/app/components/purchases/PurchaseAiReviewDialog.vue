<script setup lang="ts">
import type { Product } from '~/types/product'
import type { PurchaseAiCandidate, PurchaseAiMetadata, PurchaseItem, PurchaseOrderPayload } from '~/types/purchase'
import { useClipboardImagePaste } from '~/composables/useClipboardImagePaste'
import { formatMoney } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  candidates: readonly PurchaseAiCandidate[]
  products: readonly Product[]
  recognizing?: boolean
  submitting?: boolean
  imageFileName?: string
  images?: readonly { id: string; fileName: string; previewUrl: string }[]
  metadata?: PurchaseAiMetadata | null
  progressMessage?: string
  errorMessage?: string
}>()

const emit = defineEmits<{
  imageSelected: [files: File[]]
  imageRemoved: [id: string]
  clearImages: []
  recognize: []
  updateCandidates: [candidates: PurchaseAiCandidate[]]
  confirm: [payload: PurchaseOrderPayload]
}>()

const date = shallowRef(new Date().toISOString().slice(0, 10))
const source = shallowRef('拼多多')
const note = shallowRef('')
const formError = shallowRef('')

const totalCost = computed(() =>
  props.candidates.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
)

watch(() => props.metadata, (metadata) => {
  if (!metadata) return
  if (metadata.date) date.value = metadata.date
  if (metadata.source) source.value = metadata.source
  if (metadata.note) note.value = metadata.note
}, { immediate: true })

function confidenceLabel(confidence: PurchaseAiCandidate['confidence']) {
  if (confidence === 'high') return '高'
  if (confidence === 'medium') return '中'
  return '低'
}

function confidenceTone(confidence: PurchaseAiCandidate['confidence']) {
  if (confidence === 'high') return 'success'
  if (confidence === 'medium') return 'warning'
  return 'danger'
}

function productName(productId: string) {
  return props.products.find(product => product.id === productId)?.name || ''
}

function productById(productId: string) {
  return props.products.find(product => product.id === productId)
}

function updateCandidate(index: number, patch: Partial<PurchaseAiCandidate>) {
  const nextCandidates = props.candidates.map((candidate, candidateIndex) => {
    if (candidateIndex !== index) return candidate
    const next = { ...candidate, ...patch }
    if (patch.productId) {
      const product = productById(patch.productId)
      next.productName = product?.name || productName(patch.productId)
      next.sellPrice = Number(product?.sellPrice) || next.sellPrice
      next.machineId = product?.machineId
      next.isNewProduct = false
      next.issue = ''
      next.confidence = next.confidence === 'low' ? 'medium' : next.confidence
    }
    if ('quantity' in patch || 'unitPrice' in patch) {
      next.totalPrice = Math.round((Number(next.quantity) || 0) * (Number(next.unitPrice) || 0) * 100) / 100
    }
    if (!next.productId) {
      next.isNewProduct = true
      next.issue = Number(next.sellPrice) > 0 ? '将创建新商品' : '新商品，需填写售价'
    }
    return next
  })
  emit('updateCandidates', nextCandidates)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length > 0) emit('imageSelected', files)
  input.value = ''
}

function addManualCandidate() {
  const newCandidate: PurchaseAiCandidate = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rawName: '手动添加',
    productId: '',
    productName: '',
    confidence: 'high',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    sellPrice: 0,
    category: '其他',
    isNewProduct: true,
    issue: '新商品，需填写售价'
  }
  emit('updateCandidates', [...props.candidates, newCandidate])
}

function removeCandidate(index: number) {
  const next = props.candidates.filter((_, i) => i !== index)
  emit('updateCandidates', next)
}

useClipboardImagePaste({
  enabled: open,
  fileNamePrefix: 'purchase-screenshot',
  onImage: (file: File) => emit('imageSelected', [file])
})

function confirmOrder() {
  const invalid = props.candidates.find(candidate =>
    Number(candidate.quantity) <= 0 ||
    Number(candidate.totalPrice) <= 0 ||
    (!candidate.productId && (!candidate.productName.trim() || Number(candidate.sellPrice) <= 0))
  )
  if (invalid) {
    formError.value = '请先确认每一行的商品、数量、金额；新商品还要填写售价'
    return
  }
  const items: PurchaseItem[] = props.candidates.map(candidate => ({
    productId: candidate.productId,
    productName: candidate.productName,
    quantity: candidate.quantity,
    unitPrice: candidate.unitPrice,
    totalPrice: candidate.totalPrice,
    sellPrice: candidate.sellPrice,
    category: candidate.category,
    machineId: candidate.machineId
  }))
  formError.value = ''
  emit('confirm', {
    date: date.value,
    source: source.value.trim() || '拼多多',
    note: note.value.trim(),
    items
  })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="AI 识别确认"
    description="AI 结果只进入确认表，人工确认后才会调用进货入库接口。"
    size="wide"
  >
    <div class="ai-review">
      <div class="ai-review__top">
        <label class="ai-review__upload">
          <span>上传截图 / 直接粘贴</span>
          <input type="file" accept="image/*" multiple @change="handleFileChange">
          <strong>
            {{ props.images?.length ? `已选择 ${props.images.length} 张图片，可继续多选或 Ctrl+V 粘贴` : props.imageFileName || '可一次多选进货截图，或复制图片后按 Ctrl+V 直接粘贴' }}
          </strong>
          <div v-if="props.images?.length" class="ai-review__previews" aria-label="待识别图片">
            <article v-for="image in props.images" :key="image.id" class="ai-review__preview">
              <img :src="image.previewUrl" :alt="image.fileName">
              <div>
                <strong>{{ image.fileName }}</strong>
                <button type="button" :disabled="props.recognizing" @click.prevent="emit('imageRemoved', image.id)">
                  移除
                </button>
              </div>
            </article>
          </div>
        </label>
        <AppButton
          variant="secondary"
          :loading="props.recognizing"
          :disabled="!props.images?.length"
          @click="emit('recognize')"
        >
          开始识别
        </AppButton>
      </div>

      <p v-if="props.recognizing || props.progressMessage" class="ai-review__progress">
        {{ props.progressMessage || 'AI 正在识别图片...' }}
      </p>

      <div class="ai-review__grid">
        <AppInput v-model="date" label="进货日期" type="date" />
        <AppInput v-model="source" label="供应商/平台" placeholder="拼多多" />
        <AppInput v-model="note" label="备注" placeholder="可选" />
      </div>

      <p v-if="props.errorMessage" class="ai-review__error">
        {{ props.errorMessage }}
      </p>

      <div class="ai-review__toolbar">
        <AppButton variant="secondary" @click="addManualCandidate">
          + 手动添加商品
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="props.recognizing || (!props.images?.length && props.candidates.length === 0)"
          @click="emit('clearImages')"
        >
          清空图片
        </AppButton>
      </div>

      <div class="ai-review__scroll">
        <table class="ai-review__table">
          <thead>
            <tr>
              <th scope="col" class="ai-review__raw-col">识别名称</th>
              <th scope="col" class="ai-review__product-col">匹配商品</th>
              <th scope="col" class="ai-review__badge-col">置信度</th>
              <th scope="col" class="ai-review__number">数量</th>
              <th scope="col" class="ai-review__number">单价</th>
              <th scope="col" class="ai-review__number">小计</th>
              <th scope="col" class="ai-review__badge-col">异常</th>
              <th scope="col" class="ai-review__action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="props.candidates.length === 0">
              <td class="ai-review__empty" colspan="8">
                上传截图并识别后，在这里人工确认明细；也可以点击上方"+ 手动添加商品"直接录入
              </td>
            </tr>
            <tr v-for="(candidate, index) in props.candidates" v-else :key="candidate.id">
              <td data-label="识别名称" class="ai-review__name-cell">{{ candidate.rawName }}</td>
              <td data-label="匹配商品" class="ai-review__product-cell">
                <span class="ai-review__matched-name">
                  {{ candidate.productId ? candidate.productName : '新商品' }}
                </span>
                <ProductSearchSelect
                  :model-value="candidate.productId"
                  :products="props.products"
                  placeholder="选择商品"
                  @update:model-value="(value: string) => updateCandidate(index, { productId: value })"
                />
                <div v-if="!candidate.productId" class="ai-review__new-product">
                  <input
                    class="ai-review__input ai-review__input--name"
                    type="text"
                    placeholder="新商品名称"
                    :value="candidate.productName"
                    @input="updateCandidate(index, { productName: ($event.target as HTMLInputElement).value })"
                  >
                  <input
                    class="ai-review__input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="售价"
                    :value="candidate.sellPrice || ''"
                    @input="updateCandidate(index, { sellPrice: Number(($event.target as HTMLInputElement).value) })"
                  >
                </div>
              </td>
              <td data-label="置信度">
                <StatusBadge :label="confidenceLabel(candidate.confidence)" :tone="confidenceTone(candidate.confidence)" />
              </td>
              <td class="ai-review__number" data-label="数量">
                <input
                  class="ai-review__input"
                  type="number"
                  min="1"
                  :value="candidate.quantity"
                  @input="updateCandidate(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="ai-review__number" data-label="单价">
                <input
                  class="ai-review__input"
                  type="number"
                  min="0"
                  step="0.01"
                  :value="candidate.unitPrice"
                  @input="updateCandidate(index, { unitPrice: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="ai-review__number" data-label="小计">
                {{ formatMoney(candidate.totalPrice) }}
              </td>
              <td data-label="异常">
                <StatusBadge
                  :label="candidate.issue || '已确认'"
                  :tone="candidate.issue ? 'danger' : 'success'"
                />
              </td>
              <td data-label="操作" class="ai-review__action-cell">
                <button type="button" class="ai-review__remove" @click="removeCandidate(index)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="ai-review__footer">
        <p>
          合计 <strong>{{ formatMoney(totalCost) }}</strong>
        </p>
        <p v-if="formError" class="ai-review__error">
          {{ formError }}
        </p>
        <div class="ai-review__actions">
          <AppButton variant="secondary" @click="open = false">
            取消
          </AppButton>
          <AppButton :loading="props.submitting" :disabled="props.candidates.length === 0" @click="confirmOrder">
            人工确认并入库
          </AppButton>
        </div>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.ai-review {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.ai-review__top,
.ai-review__actions {
  min-width: 0;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-3);
}

.ai-review__upload {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  gap: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.ai-review__upload span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.ai-review__upload input {
  min-width: 0;
  max-width: 100%;
  min-height: 44px;
}

.ai-review__upload strong {
  color: var(--color-text-muted);
  font-size: 13px;
}

.ai-review__previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-2);
}

.ai-review__preview {
  min-width: 0;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-2);
  background: var(--color-surface);
}

.ai-review__preview img {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-2);
  object-fit: cover;
}

.ai-review__preview div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.ai-review__preview strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-review__preview button {
  justify-self: start;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.ai-review__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.ai-review__scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
}

.ai-review__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.ai-review__table th,
.ai-review__table td {
  height: 52px;
  padding: 0 var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-review__table th {
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.ai-review__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ai-review__raw-col {
  width: 25%;
}

.ai-review__product-col {
  width: 27%;
}

.ai-review__table td.ai-review__product-cell {
  overflow: visible;
  position: relative;
  z-index: 1;
}

.ai-review__table td.ai-review__product-cell:focus-within {
  z-index: 20;
}

.ai-review__badge-col {
  width: 72px;
}

.ai-review__select,
.ai-review__input {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
}

.ai-review__matched-name {
  display: none;
}

.ai-review__input {
  max-width: 82px;
  text-align: right;
}

.ai-review__input--name {
  max-width: none;
  text-align: left;
}

.ai-review__new-product {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 82px;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.ai-review__empty {
  color: var(--color-text-muted);
  text-align: center;
}

.ai-review__footer {
  display: grid;
  gap: var(--space-3);
}

.ai-review__footer p {
  margin: 0;
  color: var(--color-text-muted);
  text-align: right;
}

.ai-review__footer strong {
  color: var(--color-text);
  font-size: 18px;
}

.ai-review__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.ai-review__progress {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.ai-review__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-start;
}

.ai-review__action-col {
  width: 72px;
}

.ai-review__action-cell {
  text-align: center;
}

.ai-review__remove {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 6px 10px;
  background: var(--color-surface);
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ai-review__remove:hover {
  border-color: var(--color-danger);
  background: var(--color-danger-soft, #fef2f2);
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .ai-review__top,
  .ai-review__actions {
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    justify-content: stretch;
  }

  .ai-review__upload,
  .ai-review__top :deep(.app-button),
  .ai-review__actions :deep(.app-button) {
    width: 100%;
  }

  .ai-review__grid {
    grid-template-columns: 1fr;
  }

  .ai-review__scroll {
    overflow-x: visible;
    border: 0;
  }

  .ai-review__table,
  .ai-review__table tbody,
  .ai-review__table tr,
  .ai-review__table td {
    display: block;
  }

  .ai-review__table {
    table-layout: auto;
  }

  .ai-review__table thead {
    display: none;
  }

  .ai-review__table tbody {
    display: grid;
    gap: var(--space-3);
  }

  .ai-review__table tr {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    background: var(--color-surface);
  }

  .ai-review__table td {
    min-width: 0;
    height: auto;
    padding: 0;
    border-bottom: 0;
    white-space: normal;
    overflow: visible;
  }

  .ai-review__table td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 4px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .ai-review__number {
    text-align: left;
  }

  .ai-review__name-cell,
  .ai-review__product-cell,
  .ai-review__empty {
    grid-column: 1 / -1;
  }

  .ai-review__action-cell {
    grid-column: 1 / -1;
    text-align: left;
  }

  .ai-review__remove {
    width: 100%;
  }

  .ai-review__name-cell {
    line-height: 1.45;
  }

  .ai-review__matched-name {
    display: none;
  }

  .ai-review__select,
  .ai-review__input {
    min-height: var(--control-height-mobile);
  }

  .ai-review__table {
    min-width: 0;
    max-width: 100%;
  }

  .ai-review__input {
    max-width: none;
  }

  .ai-review__new-product {
    grid-template-columns: 1fr;
  }

  .ai-review__footer {
    position: sticky;
    bottom: calc(-1 * var(--space-4));
    margin: 0 calc(-1 * var(--space-4));
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .ai-review__footer p {
    text-align: left;
  }
}
</style>
