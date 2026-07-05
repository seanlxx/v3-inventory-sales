<script setup lang="ts">
import type { ProfitProduct, ProfitSalesPayload, ProfitSalesRecord } from '~/types/profit'

const props = defineProps<{
  record?: ProfitSalesRecord | null
  products: readonly ProfitProduct[]
  machines: readonly string[]
  saving?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ProfitSalesPayload]
  cancel: []
}>()

const today = () => new Date().toISOString().slice(0, 10)
const lineKey = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

type SalesLineDraft = {
  key: string
  productGlobalId: string
  quantity: number
  unitPrice: number
  unitCost: number
}

const draft = reactive({
  type: 'sale' as ProfitSalesPayload['type'],
  machineId: '1号机',
  recordDate: today(),
  platformFee: 0,
  serviceFee: 0,
  discount: 0,
  externalId: '',
  note: '',
  items: [] as SalesLineDraft[]
})

const title = computed(() => props.record ? '编辑销售' : '新增销售')

const productOptions = computed(() =>
  props.products.filter(product =>
    product.status === 'active'
    || draft.items.some(item => item.productGlobalId === product.productGlobalId)
  )
)

const machineOptions = computed(() =>
  props.machines.filter(machine => machine !== 'all')
)

const lineAmount = computed(() =>
  draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
)

const cogsAmount = computed(() =>
  draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0)
)

const feesAmount = computed(() =>
  (Number(draft.platformFee) || 0) + (Number(draft.serviceFee) || 0) + (Number(draft.discount) || 0)
)

const canSubmit = computed(() =>
  !!draft.machineId
  && draft.items.length > 0
  && draft.items.every(item => item.productGlobalId && Number(item.quantity) > 0)
)

function productDefault(productGlobalId: string, key: 'defaultSellPrice' | 'lastCost') {
  return props.products.find(product => product.productGlobalId === productGlobalId)?.[key] || 0
}

function emptyLine(): SalesLineDraft {
  const productGlobalId = productOptions.value[0]?.productGlobalId || ''
  return {
    key: lineKey(),
    productGlobalId,
    quantity: 1,
    unitPrice: productDefault(productGlobalId, 'defaultSellPrice'),
    unitCost: productDefault(productGlobalId, 'lastCost')
  }
}

function applyProductDefaults(item: SalesLineDraft, force = false) {
  if (force || !item.unitPrice) item.unitPrice = productDefault(item.productGlobalId, 'defaultSellPrice')
  if (force || !item.unitCost) item.unitCost = productDefault(item.productGlobalId, 'lastCost')
}

function syncDraft() {
  draft.type = props.record?.type || 'sale'
  draft.machineId = props.record?.machineId || machineOptions.value[0] || '1号机'
  draft.recordDate = props.record?.recordDate || today()
  draft.platformFee = props.record?.platformFee || 0
  draft.serviceFee = props.record?.serviceFee || 0
  draft.discount = props.record?.discount || 0
  draft.externalId = props.record?.externalId || ''
  draft.note = props.record?.note || ''
  draft.items = props.record?.items.length
    ? props.record.items.map(item => ({
        key: lineKey(),
        productGlobalId: item.productGlobalId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost
      }))
    : [emptyLine()]
}

function addLine() {
  draft.items.push(emptyLine())
}

function removeLine(index: number) {
  if (draft.items.length <= 1) return
  draft.items.splice(index, 1)
}

function submit() {
  emit('submit', {
    id: props.record?.id,
    type: draft.type,
    machineId: draft.machineId,
    recordDate: draft.recordDate,
    source: 'manual',
    externalId: draft.externalId,
    note: draft.note,
    platformFee: Number(draft.platformFee) || 0,
    serviceFee: Number(draft.serviceFee) || 0,
    discount: Number(draft.discount) || 0,
    items: draft.items.map(item => ({
      productGlobalId: item.productGlobalId,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      unitCost: Number(item.unitCost) || 0
    }))
  })
}

watch(() => props.record, syncDraft, { immediate: true })

watch(productOptions, () => {
  for (const item of draft.items) {
    if (!item.productGlobalId) item.productGlobalId = productOptions.value[0]?.productGlobalId || ''
    if (!props.record && item.productGlobalId) applyProductDefaults(item)
  }
})
</script>

<template>
  <section class="profit-editor surface-panel" aria-label="销售编辑">
    <header class="profit-editor__header">
      <h2>{{ title }}</h2>
      <AppButton type="button" variant="ghost" @click="emit('cancel')">
        关闭
      </AppButton>
    </header>

    <form class="profit-editor__form" @submit.prevent="submit">
      <label class="profit-editor__field">
        <span>类型</span>
        <select v-model="draft.type">
          <option value="sale">销售</option>
          <option value="refund">退款</option>
          <option value="loss">损耗</option>
        </select>
      </label>
      <label class="profit-editor__field">
        <span>设备</span>
        <select v-model="draft.machineId">
          <option
            v-for="machine in machineOptions"
            :key="machine"
            :value="machine"
          >
            {{ machine }}
          </option>
        </select>
      </label>
      <AppInput v-model="draft.recordDate" label="日期" type="date" />
      <AppInput v-model="draft.platformFee" label="手续费" type="number" step="0.01" />
      <AppInput v-model="draft.serviceFee" label="服务费" type="number" step="0.01" />
      <AppInput v-model="draft.discount" label="优惠" type="number" step="0.01" />
      <AppInput v-model="draft.externalId" label="外部单号" autocomplete="off" />
      <AppInput v-model="draft.note" label="备注" autocomplete="off" />

      <div class="profit-editor__totals">
        <span>销售额 {{ lineAmount.toFixed(2) }}</span>
        <span>成本 {{ cogsAmount.toFixed(2) }}</span>
        <span>费用 {{ feesAmount.toFixed(2) }}</span>
      </div>

      <div class="profit-editor__lines" aria-label="销售明细">
        <div
          v-for="(item, index) in draft.items"
          :key="item.key"
          class="profit-editor__line"
        >
          <label class="profit-editor__field profit-editor__field--product">
            <span>商品</span>
            <select v-model="item.productGlobalId" @change="applyProductDefaults(item, true)">
              <option value="">请选择</option>
              <option
                v-for="product in productOptions"
                :key="product.productGlobalId"
                :value="product.productGlobalId"
              >
                {{ product.productName }}
              </option>
            </select>
          </label>
          <AppInput
            :id="`sales-qty-${item.key}`"
            v-model="item.quantity"
            label="数量"
            type="number"
            step="1"
          />
          <AppInput
            :id="`sales-price-${item.key}`"
            v-model="item.unitPrice"
            label="单价"
            type="number"
            step="0.01"
          />
          <AppInput
            :id="`sales-cost-${item.key}`"
            v-model="item.unitCost"
            label="单位成本"
            type="number"
            step="0.01"
          />
          <div class="profit-editor__line-total">
            <span>小计</span>
            <strong>{{ ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2) }}</strong>
          </div>
          <AppButton
            type="button"
            variant="ghost"
            :disabled="draft.items.length <= 1"
            @click="removeLine(index)"
          >
            删除
          </AppButton>
        </div>
      </div>

      <div class="profit-editor__actions">
        <AppButton type="button" variant="secondary" @click="addLine">
          添加明细
        </AppButton>
        <AppButton type="button" variant="secondary" @click="emit('cancel')">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.saving" :disabled="!canSubmit">
          保存销售
        </AppButton>
      </div>
    </form>
  </section>
</template>

<style scoped>
.profit-editor {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.profit-editor__header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.profit-editor__header h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.profit-editor__form {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: end;
}

.profit-editor__lines,
.profit-editor__totals {
  grid-column: 1 / -1;
}

.profit-editor__lines {
  display: grid;
  gap: var(--space-2);
}

.profit-editor__line {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 90px 110px 110px 110px auto;
  gap: var(--space-2);
  align-items: end;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.profit-editor__totals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.profit-editor__totals span,
.profit-editor__line-total {
  min-height: var(--control-height);
  display: grid;
  align-content: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
}

.profit-editor__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-editor__field--product {
  grid-column: span 2;
}

.profit-editor__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-editor__line-total span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-editor__line-total strong {
  font-family: var(--font-mono);
}

.profit-editor__field select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.profit-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 1180px) {
  .profit-editor__form {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .profit-editor__line {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profit-editor__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .profit-editor {
    padding: var(--space-3);
  }

  .profit-editor__header {
    align-items: flex-start;
  }

  .profit-editor__form {
    grid-template-columns: 1fr;
  }

  .profit-editor__line {
    grid-template-columns: 1fr;
  }

  .profit-editor__field--product,
  .profit-editor__actions {
    grid-column: auto;
  }

  .profit-editor__actions {
    display: grid;
  }
}
</style>
