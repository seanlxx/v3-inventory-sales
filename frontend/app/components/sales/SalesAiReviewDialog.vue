<script setup lang="ts">
import type { Product } from '~/types/product'
import type { SalesAiCandidate, SalesItem, SalesOrderPayload } from '~/types/sale'
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
  clear: []
  recognize: []
  updateCandidates: [candidates: SalesAiCandidate[]]
  confirm: [payload: SalesOrderPayload]
}>()

const date = shallowRef(new Date().toISOString().slice(0, 10))
const machineId = shallowRef('')
const note = shallowRef('')
const formError = shallowRef('')

const columns = ['识别名称', '匹配商品', '库存', '置信度', '数量', '单价', '小计', '异常', '操作'] as const

const totalAmount = computed(() =>
  props.candidates.reduce((sum, item) => sum + Number(item.itemRevenue || 0), 0)
)

const displayError = computed(() => formError.value || props.inventoryError || '')

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
    if ('productId' in patch) {
      if (patch.productId) {
        const product = productById(patch.productId)
        next.productName = product?.name || ''
        next.issue = ''
        next.confidence = 'high'
      } else {
        next.productName = ''
        next.issue = '未匹配商品'
      }
    }
    if ('quantity' in patch || 'sellPrice' in patch) {
      next.quantity = Math.abs(Number(next.quantity) || 0)
      next.sellPrice = Math.abs(Number(next.sellPrice) || 0)
      next.itemRevenue = Math.round(next.quantity * next.sellPrice * 100) / 100
    }
    return next
  })
  emit('updateCandidates', nextCandidates)
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
  <AiRecognitionDialog
    v-model:open="open"
    title="AI 销售识别确认"
    description="AI 结果只进入确认表，人工确认后才会创建销售单。"
    upload-title="上传销售截图 / 直接粘贴"
    upload-hint="选择一张或多张销售截图，或复制图片后按 Ctrl+V"
    empty-message="上传截图并识别后，在这里人工确认销售明细；也可以点击上方“+ 手动添加商品”直接录入"
    paste-file-name-prefix="sales-screenshot"
    clear-label="清空图片"
    confirm-label="人工确认并创建销售单"
    :columns="columns"
    :candidates-count="props.candidates.length"
    :total-value="formatMoney(totalAmount)"
    :images="props.images"
    :recognizing="props.recognizing"
    :submitting="props.submitting"
    :progress-message="props.progressMessage"
    :error-message="props.errorMessage"
    :form-error="displayError"
    @image-selected="emit('imageSelected', $event)"
    @image-removed="emit('imageRemoved', $event)"
    @clear="emit('clear')"
    @recognize="emit('recognize')"
    @add-manual="addManualCandidate"
    @confirm="confirmOrder"
  >
    <template #fields>
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
    </template>

    <template #rows>
      <tr v-for="(candidate, index) in props.candidates" :key="candidate.id">
        <td data-label="识别名称" class="ai-recognition__name-cell">{{ candidate.rawName }}</td>
        <td data-label="匹配商品" class="ai-recognition__product-cell">
          <span class="ai-recognition__matched-name">
            {{ candidate.productName || '未匹配商品' }}
          </span>
          <ProductSearchSelect
            :model-value="candidate.productId"
            :products="props.products"
            placeholder="选择商品"
            @update:model-value="(value: string) => updateCandidate(index, { productId: value })"
          />
        </td>
        <td data-label="库存" class="ai-recognition__number">{{ formatQuantity(productById(candidate.productId)?.currentStock) }}</td>
        <td data-label="置信度">
          <StatusBadge :label="confidenceLabel(candidate.confidence)" :tone="confidenceTone(candidate.confidence)" />
        </td>
        <td class="ai-recognition__number" data-label="数量">
          <input
            class="ai-recognition__input"
            type="number"
            min="1"
            :value="candidate.quantity"
            @input="updateCandidate(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
          >
        </td>
        <td class="ai-recognition__number" data-label="单价">
          <input
            class="ai-recognition__input"
            type="number"
            min="0"
            step="0.01"
            :value="candidate.sellPrice"
            @input="updateCandidate(index, { sellPrice: Number(($event.target as HTMLInputElement).value) })"
          >
        </td>
        <td class="ai-recognition__number" data-label="小计">
          {{ formatMoney(candidate.itemRevenue) }}
        </td>
        <td data-label="异常">
          <StatusBadge :label="candidate.issue || '已确认'" :tone="candidate.issue ? 'danger' : 'success'" />
        </td>
        <td data-label="操作" class="ai-recognition__action-cell">
          <button type="button" class="ai-recognition__remove" @click="removeCandidate(index)">
            删除
          </button>
        </td>
      </tr>
    </template>
  </AiRecognitionDialog>
</template>

<style scoped>
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

.sales-ai__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
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

@media (max-width: 760px) {
  .sales-ai__grid {
    grid-template-columns: 1fr;
  }

  .sales-ai__select-control {
    min-height: var(--control-height-mobile);
  }
}
</style>
