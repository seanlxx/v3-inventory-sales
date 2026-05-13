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
  imageFileName?: string
  errorMessage?: string
  inventoryError?: string | null
}>()

const emit = defineEmits<{
  imageSelected: [file: File]
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
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('imageSelected', file)
}

useClipboardImagePaste({
  enabled: open,
  fileNamePrefix: 'sales-screenshot',
  onImage: (file: File) => emit('imageSelected', file)
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
  >
    <div class="sales-ai">
      <div class="sales-ai__top">
        <label class="sales-ai__upload">
          <span>上传销售截图 / 直接粘贴</span>
          <input type="file" accept="image/*" @change="handleFileChange">
          <strong>{{ props.imageFileName || '选择销售截图，或复制图片后按 Ctrl+V' }}</strong>
        </label>
        <AppButton variant="secondary" :loading="props.recognizing" @click="emit('recognize')">
          开始识别
        </AppButton>
      </div>

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
              <th scope="col">识别名称</th>
              <th scope="col">匹配商品</th>
              <th scope="col">库存</th>
              <th scope="col">置信度</th>
              <th scope="col" class="sales-ai__number">数量</th>
              <th scope="col" class="sales-ai__number">单价</th>
              <th scope="col" class="sales-ai__number">小计</th>
              <th scope="col">异常</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="props.candidates.length === 0">
              <td class="sales-ai__empty" colspan="8">
                上传截图并识别后，在这里人工确认销售明细
              </td>
            </tr>
            <tr v-for="(candidate, index) in props.candidates" v-else :key="candidate.id">
              <td>{{ candidate.rawName }}</td>
              <td>
                <select
                  class="sales-ai__select"
                  :value="candidate.productId"
                  @change="updateCandidate(index, { productId: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="">选择商品</option>
                  <option v-for="product in props.products" :key="product.id" :value="product.id">
                    {{ product.name }}
                  </option>
                </select>
              </td>
              <td>{{ formatQuantity(productById(candidate.productId)?.currentStock) }}</td>
              <td>
                <StatusBadge :label="confidenceLabel(candidate.confidence)" :tone="confidenceTone(candidate.confidence)" />
              </td>
              <td class="sales-ai__number">
                <input
                  class="sales-ai__input"
                  type="number"
                  min="1"
                  :value="candidate.quantity"
                  @input="updateCandidate(index, { quantity: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="sales-ai__number">
                <input
                  class="sales-ai__input"
                  type="number"
                  min="0"
                  step="0.01"
                  :value="candidate.sellPrice"
                  @input="updateCandidate(index, { sellPrice: Number(($event.target as HTMLInputElement).value) })"
                >
              </td>
              <td class="sales-ai__number">
                {{ formatMoney(candidate.itemRevenue) }}
              </td>
              <td>
                <StatusBadge :label="candidate.issue || '已确认'" :tone="candidate.issue ? 'danger' : 'success'" />
              </td>
            </tr>
          </tbody>
        </table>
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
  display: grid;
  gap: var(--space-4);
}

.sales-ai__top,
.sales-ai__actions {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-3);
}

.sales-ai__upload {
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
  min-height: 44px;
}

.sales-ai__upload strong {
  color: var(--color-text-muted);
  font-size: 13px;
}

.sales-ai__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-ai__field {
  display: grid;
  gap: 6px;
}

.sales-ai__select-control {
  width: 100%;
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
  min-width: 980px;
  border-collapse: collapse;
}

.sales-ai__table th,
.sales-ai__table td {
  height: 52px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
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

.sales-ai__select,
.sales-ai__input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
}

.sales-ai__input {
  max-width: 110px;
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

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .sales-ai__top,
  .sales-ai__actions {
    display: grid;
  }

  .sales-ai__grid {
    grid-template-columns: 1fr;
  }

  .sales-ai__select-control {
    min-height: var(--control-height-mobile);
  }

  .sales-ai__table {
    min-width: 900px;
  }
}
</style>
