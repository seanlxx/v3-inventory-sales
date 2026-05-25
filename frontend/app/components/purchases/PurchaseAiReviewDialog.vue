<script setup lang="ts">
import type { Product } from '~/types/product'
import type { PurchaseAiCandidate, PurchaseAiMetadata, PurchaseItem, PurchaseOrderPayload } from '~/types/purchase'
import { formatMoney } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  candidates: readonly PurchaseAiCandidate[]
  products: readonly Product[]
  recognizing?: boolean
  submitting?: boolean
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

const columns = ['识别名称', '匹配商品', '置信度', '数量', '单价', '小计', '异常', '操作'] as const

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
  <AiRecognitionDialog
    v-model:open="open"
    title="AI 进货识别确认"
    description="AI 结果只进入确认表，人工确认后才会调用进货入库接口。"
    upload-title="上传进货截图 / 直接粘贴"
    upload-hint="可一次多选进货截图，或复制图片后按 Ctrl+V 直接粘贴"
    empty-message="上传截图并识别后，在这里人工确认进货明细；也可以点击上方“+ 手动添加商品”直接录入"
    paste-file-name-prefix="purchase-screenshot"
    clear-label="清空图片"
    confirm-label="人工确认并入库"
    :columns="columns"
    :candidates-count="props.candidates.length"
    :total-value="formatMoney(totalCost)"
    :images="props.images"
    :recognizing="props.recognizing"
    :submitting="props.submitting"
    :progress-message="props.progressMessage"
    :error-message="props.errorMessage"
    :form-error="formError"
    @image-selected="emit('imageSelected', $event)"
    @image-removed="emit('imageRemoved', $event)"
    @clear="emit('clearImages')"
    @recognize="emit('recognize')"
    @add-manual="addManualCandidate"
    @confirm="confirmOrder"
  >
    <template #fields>
      <div class="purchase-ai__grid">
        <AppInput v-model="date" label="进货日期" type="date" />
        <AppInput v-model="source" label="供应商/平台" placeholder="拼多多" />
        <AppInput v-model="note" label="备注" placeholder="可选" />
      </div>
    </template>

    <template #rows>
      <tr v-for="(candidate, index) in props.candidates" :key="candidate.id">
        <td data-label="识别名称" class="ai-recognition__name-cell">{{ candidate.rawName }}</td>
        <td data-label="匹配商品" class="ai-recognition__product-cell">
          <span class="ai-recognition__matched-name">
            {{ candidate.productId ? candidate.productName : '新商品' }}
          </span>
          <ProductSearchSelect
            :model-value="candidate.productId"
            :products="props.products"
            placeholder="选择商品"
            @update:model-value="(value: string) => updateCandidate(index, { productId: value })"
          />
          <div v-if="!candidate.productId" class="ai-recognition__new-product">
            <input
              class="ai-recognition__input ai-recognition__input--name"
              type="text"
              placeholder="新商品名称"
              :value="candidate.productName"
              @input="updateCandidate(index, { productName: ($event.target as HTMLInputElement).value })"
            >
            <input
              class="ai-recognition__input"
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
            :value="candidate.unitPrice"
            @input="updateCandidate(index, { unitPrice: Number(($event.target as HTMLInputElement).value) })"
          >
        </td>
        <td class="ai-recognition__number" data-label="小计">
          {{ formatMoney(candidate.totalPrice) }}
        </td>
        <td data-label="异常">
          <StatusBadge
            :label="candidate.issue || '已确认'"
            :tone="candidate.issue ? 'danger' : 'success'"
          />
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
.purchase-ai__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (max-width: 760px) {
  .purchase-ai__grid {
    grid-template-columns: 1fr;
  }
}
</style>
