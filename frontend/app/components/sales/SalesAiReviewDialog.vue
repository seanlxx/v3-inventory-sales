<script setup lang="ts">
import type { Product } from '~/types/product'
import type { SalesAiCandidate, SalesItem, SalesOrderPayload } from '~/types/sale'
import { useClipboardImagePaste } from '~/composables/useClipboardImagePaste'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  candidates: readonly SalesAiCandidate[]
  products: readonly Product[]
  machines: readonly string[]
  recognizing?: boolean
  submitting?: boolean
  images?: readonly { id: string; fileName: string; previewUrl: string }[]
  progressMessage?: string
  errorMessage?: string
  inventoryError?: string | null
}>()

const emit = defineEmits<{
  imageSelected: [files: File[]]
  imageRemoved: [id: string]
  recognize: []
  updateCandidates: [candidates: SalesAiCandidate[]]
  confirm: [payload: SalesOrderPayload]
}>()

const date = shallowRef(new Date().toISOString().slice(0, 10))
const machineId = shallowRef('')
const note = shallowRef('')
const formError = shallowRef('')

const totalAmount = computed(() =>
  props.candidates.reduce((sum, item) => sum + Number(item.itemRevenue || 0), 0)
)

function confidenceLabel(confidence: SalesAiCandidate['confidence']) {
  if (confidence === 'high') return '高'
  if (confidence === 'medium') return '中'
  return '低'
}

function confidenceTone(confidence: SalesAiCandidate['confidence']) {
  if (confidence === 'high') return 'success'
  if (confidence === 'medium') return 'warning'
  return 'danger'
}

function productById(productId: string) {
  return props.products.find(product => product.id === productId)
}

function updateCandidate(index: number, patch: Partial<SalesAiCandidate>) {
  const nextCandidates = props.candidates.map((candidate, candidateIndex) => {
    if (candidateIndex !== index) return candidate
    const next = { ...candidate, ...patch }
    if (patch.productId) {
      const product = productById(patch.productId)
      next.productName = product?.name || ''
      next.sellPrice = Number(product?.sellPrice) || next.sellPrice
      next.issue = ''
      next.confidence = next.confidence === 'low' ? 'medium' : next.confidence
    }
    if ('quantity' in patch || 'sellPrice' in patch || 'productId' in patch) {
      next.quantity = Math.abs(Number(next.quantity) || 0)
      next.sellPrice = Math.abs(Number(next.sellPrice) || 0)
      next.itemRevenue = Math.round(next.quantity * next.sellPrice * 100) / 100
    }
    if (!next.productId) next.issue = '未匹配商品'
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
  const newCandidate: SalesAiCandidate = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rawName: '手动添加',
    productId: '',
    productName: '',
    confidence: 'high',
    quantity: 1,
    sellPrice: 0,
    itemRevenue: 0,
    issue: '未匹配商品'
  }
  emit('updateCandidates', [...props.candidates, newCandidate])
}

function removeCandidate(index: number) {
  const next = props.candidates.filter((_, i) => i !== index)
  emit('updateCandidates', next)
}

useClipboardImagePaste({
  enabled: open,
  fileNamePrefix: 'sales-screenshot',
  onImage: (file: File) => emit('imageSelected', [file])
})

function confirmOrder() {
  const invalid = props.candidates.find(candidate =>
    !candidate.productId || Number(candidate.quantity) <= 0 || Number(candidate.itemRevenue) < 0
  )
  if (invalid) {
    formError.value = '请先确认每一行的商品、数量和金额'
    return
  }
  const items: SalesItem[] = props.candidates.map(candidate => ({
    productId: candidate.productId,
    productName: candidate.productName,
    quantity: candidate.quantity,
    sellPrice: candidate.sellPrice,
    itemRevenue: candidate.itemRevenue
  }))
  formError.value = ''
  emit('confirm', {
    date: date.value,
    machineId: machineId.value || undefined,
    note: note.value.trim(),
    items
  })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="AI 销售识别确认"
    description="AI 结果只进入确认表，人工确认后才会创建销售单。"
    size="wide"
  >
    <div class="sales-ai">
      <div class="sales-ai__top">
        <label class="sales-ai__upload">
          <span>上传销售截图 / 直接粘贴</span>
          <input type="file" accept="image/*" multiple @change="handleFileChange">
          <strong>{{ props.images?.length ? `已选择 ${props.images.length} 张图片，可继续添加` : '选择一张或多张销售截图，或复制图片后按 Ctrl+V' }}</strong>
          <div v-if="props.images?.length" class="sales-ai__previews" aria-label="待识别图片">
            <article v-for="image in props.images" :key="image.id" class="sales-ai__preview">
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
        <AppButton variant="secondary" :loading="props.recognizing" :disabled="!props.images?.length" @click="emit('recognize')">
          开始识别
        </AppButton>
      </div>

      <p v-if="props.recognizing || props.progressMessage" class="sales-ai__progress">
        {{ props.progressMessage || 'AI 正在识别图片...' }}
      </p>

      <div class="sales-ai__grid">
        <AppInput v-model="date" label="销售日期" type="date" />
        <label class="sales-ai__field">
          <span>售货机</span>
          <select v-model="machineId" class="sales-ai__select-control">
            <option value="">按商品所属机器</option>
            <option v-for="machine in props.machines" :key="machine" :value="machine">
              {{ machine }}
            </option>
          </select>
        </label>
        <AppInput v-model="note" label="备注" placeholder="可选" />
      </div>

      <p v-if="props.errorMessage || formError || props.inventoryError" class="sales-ai__error">
        {{ props.errorMessage || formError || props.inventoryError }}
      </p>

      <div class="sales-ai__scroll">
        <table class="sales-ai__table">
          <thead>
            <tr>
              <th scope="col" class="sales-ai__raw-col">识别名称</th>
              <th scope="col" class="sales-ai__product-col">匹配商品</th>
              <th scope="col">库存</th>
              <th scope="col" class="sales-ai__badge-col">置信度</th>
              <th scope="col" class="sales-ai__number">数量</th>
              <th scope="col" class="sales-ai__number">单价</th>
              <th scope="col" class="sales-ai__number">小计</th>
              <th scope="col" class="sales-ai__badge-col">异常</th>
              <th scope="col" class="sales-ai__action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="props.candidates.length === 0">
              <td class="sales-ai__empty" colspan="9">
                上传截图并识别后，在这里人工确认销售明细；也可以点击下方"+ 手动添加商品"直接录入
              </td>
            </tr>
            <tr v-for="(candidate, index) in props.candidates" v-else :key="candidate.id">
              <td data-label="识别名称" class="sales-ai__name-cell">{{ candidate.rawName }}</td>
              <td data-label="匹配商品" class="sales-ai__product-cell">
                <span class="sales-ai__matched-name">
                  {{ candidate.productName || '未匹配商品' }}
                </span>
                <ProductSearchSelect
                  :model-value="candidate.productId"
                  :products="props.products"
                  placeholder="选择商品"
                  @update:model-value="(value: string) => updateCandidate(index, { productId: value })"
                />
              </td>
              <td data-label="库存">{{ formatQuantity(productById(candidate.productId)?.currentStock) }}</td>
              <td data-label="置信度">
                <StatusBadge :label="confidenceLabel(candidate.confidence)" :tone="confidenceTone(candidate.confidence)" />
              </td>
              <td class="sales-ai__number" data-label="数量">
                <input
                  class="sales-ai__input"
                  type="number"
                  min="1"
                  :value="candidate.quantity"
                  @input="updateCandidate(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="sales-ai__number" data-label="单价">
                <input
                  class="sales-ai__input"
                  type="number"
                  min="0"
                  step="0.01"
                  :value="candidate.sellPrice"
                  @input="updateCandidate(index, { sellPrice: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="sales-ai__number" data-label="小计">
                {{ formatMoney(candidate.itemRevenue) }}
              </td>
              <td data-label="异常">
                <StatusBadge :label="candidate.issue || '已确认'" :tone="candidate.issue ? 'danger' : 'success'" />
              </td>
              <td data-label="操作" class="sales-ai__action-cell">
                <button type="button" class="sales-ai__remove" @click="removeCandidate(index)">
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sales-ai__toolbar">
        <AppButton variant="secondary" @click="addManualCandidate">
          + 手动添加商品
        </AppButton>
      </div>

      <footer class="sales-ai__footer">
        <p>
          合计 <strong>{{ formatMoney(totalAmount) }}</strong>
        </p>
        <div class="sales-ai__actions">
          <AppButton variant="secondary" @click="open = false">
            取消
          </AppButton>
          <AppButton :loading="props.submitting" :disabled="props.candidates.length === 0" @click="confirmOrder">
            人工确认并创建销售单
          </AppButton>
        </div>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.sales-ai {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.sales-ai__top,
.sales-ai__actions {
  min-width: 0;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-3);
}

.sales-ai__upload {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  gap: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.sales-ai__upload span,
.sales-ai__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.sales-ai__upload input {
  min-width: 0;
  max-width: 100%;
  min-height: 44px;
}

.sales-ai__upload strong {
  color: var(--color-text-muted);
  font-size: 13px;
}

.sales-ai__previews {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-3);
}

.sales-ai__preview {
  min-width: 0;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
}

.sales-ai__preview img {
  width: 56px;
  height: 56px;
  border-radius: calc(var(--radius-2) - 2px);
  object-fit: cover;
  background: var(--color-surface-subtle);
}

.sales-ai__preview div {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sales-ai__preview strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sales-ai__preview button {
  width: fit-content;
  min-height: 28px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.sales-ai__preview button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.sales-ai__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-ai__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sales-ai__select-control {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
}

.sales-ai__scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
}

.sales-ai__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.sales-ai__table th,
.sales-ai__table td {
  height: 52px;
  padding: 0 var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sales-ai__table th {
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.sales-ai__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sales-ai__raw-col {
  width: 24%;
}

.sales-ai__product-col {
  width: 24%;
}

.sales-ai__badge-col {
  width: 72px;
}

.sales-ai__select,
.sales-ai__input {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
}

.sales-ai__matched-name {
  display: none;
}

.sales-ai__input {
  max-width: 82px;
  text-align: right;
}

.sales-ai__empty {
  color: var(--color-text-muted);
  text-align: center;
}

.sales-ai__footer {
  display: grid;
  gap: var(--space-3);
}

.sales-ai__footer p {
  margin: 0;
  color: var(--color-text-muted);
  text-align: right;
}

.sales-ai__footer strong {
  color: var(--color-text);
  font-size: 18px;
}

.sales-ai__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.sales-ai__progress {
  margin: 0;
  border-radius: var(--radius-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
}

.sales-ai__toolbar {
  display: flex;
  justify-content: flex-start;
}

.sales-ai__action-col {
  width: 72px;
}

.sales-ai__action-cell {
  text-align: center;
}

.sales-ai__remove {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 6px 10px;
  background: var(--color-surface);
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sales-ai__remove:hover {
  border-color: var(--color-danger);
  background: var(--color-danger-soft, #fef2f2);
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .sales-ai__top,
  .sales-ai__actions {
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
    justify-content: stretch;
  }

  .sales-ai__upload,
  .sales-ai__top :deep(.app-button),
  .sales-ai__actions :deep(.app-button) {
    width: 100%;
  }

  .sales-ai__grid {
    grid-template-columns: 1fr;
  }

  .sales-ai__previews {
    grid-template-columns: 1fr;
  }

  .sales-ai__select-control {
    min-height: var(--control-height-mobile);
  }

  .sales-ai__scroll {
    overflow-x: visible;
    border: 0;
  }

  .sales-ai__table,
  .sales-ai__table tbody,
  .sales-ai__table tr,
  .sales-ai__table td {
    display: block;
  }

  .sales-ai__table {
    table-layout: auto;
  }

  .sales-ai__table thead {
    display: none;
  }

  .sales-ai__table tbody {
    display: grid;
    gap: var(--space-3);
  }

  .sales-ai__table tr {
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

  .sales-ai__table td {
    min-width: 0;
    height: auto;
    padding: 0;
    border-bottom: 0;
    white-space: normal;
    overflow: visible;
  }

  .sales-ai__table td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 4px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .sales-ai__number {
    text-align: left;
  }

  .sales-ai__name-cell,
  .sales-ai__product-cell,
  .sales-ai__empty {
    grid-column: 1 / -1;
  }

  .sales-ai__action-cell {
    grid-column: 1 / -1;
    text-align: left;
  }

  .sales-ai__remove {
    width: 100%;
  }

  .sales-ai__name-cell {
    line-height: 1.45;
  }

  .sales-ai__matched-name {
    display: none;
  }

  .sales-ai__select,
  .sales-ai__input {
    min-height: var(--control-height-mobile);
  }

  .sales-ai__table {
    min-width: 0;
    max-width: 100%;
  }

  .sales-ai__input {
    max-width: none;
  }

  .sales-ai__footer {
    position: sticky;
    bottom: calc(-1 * var(--space-4));
    margin: 0 calc(-1 * var(--space-4));
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .sales-ai__footer p {
    text-align: left;
  }
}
</style>
