<script setup lang="ts">
import type { ProfitProduct, ProfitPurchasePayload, ProfitPurchaseRecord } from '~/types/profit'

const props = defineProps<{
  record?: ProfitPurchaseRecord | null
  products: readonly ProfitProduct[]
  saving?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ProfitPurchasePayload]
  cancel: []
}>()

const today = () => new Date().toISOString().slice(0, 10)
const lineKey = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

type PurchaseLineDraft = {
  key: string
  productGlobalId: string
  quantity: number
  unitCost: number
}

const draft = reactive({
  recordDate: today(),
  note: '',
  items: [] as PurchaseLineDraft[]
})

const title = computed(() => props.record ? '编辑进货' : '新增进货')

const productOptions = computed(() =>
  props.products.filter(product =>
    product.status === 'active'
    || draft.items.some(item => item.productGlobalId === product.productGlobalId)
  )
)

const totalCost = computed(() =>
  draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0)
)

const canSubmit = computed(() =>
  draft.items.length > 0
  && draft.items.every(item => item.productGlobalId && Number(item.quantity) > 0 && Number(item.unitCost) > 0)
)

function emptyLine(): PurchaseLineDraft {
  return {
    key: lineKey(),
    productGlobalId: productOptions.value[0]?.productGlobalId || '',
    quantity: 1,
    unitCost: 0
  }
}

function syncDraft() {
  draft.recordDate = props.record?.recordDate || today()
  draft.note = props.record?.note || ''
  draft.items = props.record?.items.length
    ? props.record.items.map(item => ({
        key: lineKey(),
        productGlobalId: item.productGlobalId,
        quantity: item.quantity,
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
    recordDate: draft.recordDate,
    source: 'manual',
    note: draft.note,
    items: draft.items.map(item => ({
      productGlobalId: item.productGlobalId,
      quantity: Number(item.quantity) || 0,
      unitCost: Number(item.unitCost) || 0
    }))
  })
}

watch(() => props.record, syncDraft, { immediate: true })

watch(productOptions, () => {
  for (const item of draft.items) {
    if (!item.productGlobalId) item.productGlobalId = productOptions.value[0]?.productGlobalId || ''
  }
})
</script>

<template>
  <section class="profit-editor surface-panel" aria-label="进货编辑">
    <header class="profit-editor__header">
      <h2>{{ title }}</h2>
      <AppButton type="button" variant="ghost" @click="emit('cancel')">
        关闭
      </AppButton>
    </header>

    <form class="profit-editor__form" @submit.prevent="submit">
      <div class="profit-editor__meta">
        <AppInput v-model="draft.recordDate" label="日期" type="date" />
        <AppInput v-model="draft.note" label="备注" autocomplete="off" />
        <div class="profit-editor__total">
          <span>合计成本</span>
          <strong>{{ totalCost.toFixed(2) }}</strong>
        </div>
      </div>

      <div class="profit-editor__lines" aria-label="进货明细">
        <div
          v-for="(item, index) in draft.items"
          :key="item.key"
          class="profit-editor__line"
        >
          <label class="profit-editor__field profit-editor__field--product">
            <span>商品</span>
            <select v-model="item.productGlobalId">
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
            :id="`purchase-qty-${item.key}`"
            v-model="item.quantity"
            label="数量"
            type="number"
            step="1"
          />
          <AppInput
            :id="`purchase-cost-${item.key}`"
            v-model="item.unitCost"
            label="单件成本"
            type="number"
            step="0.01"
          />
          <div class="profit-editor__line-total">
            <span>小计</span>
            <strong>{{ ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)).toFixed(2) }}</strong>
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
          保存进货
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
  gap: var(--space-3);
}

.profit-editor__meta {
  display: grid;
  grid-template-columns: 0.8fr minmax(0, 1fr) 160px;
  gap: var(--space-3);
  align-items: end;
}

.profit-editor__lines {
  display: grid;
  gap: var(--space-2);
}

.profit-editor__line {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 110px 140px 120px auto;
  gap: var(--space-2);
  align-items: end;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.profit-editor__field,
.profit-editor__total,
.profit-editor__line-total {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-editor__field span,
.profit-editor__total span,
.profit-editor__line-total span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-editor__total,
.profit-editor__line-total {
  min-height: var(--control-height);
  align-content: center;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
}

.profit-editor__total strong,
.profit-editor__line-total strong {
  color: var(--color-text);
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
  .profit-editor__meta,
  .profit-editor__line {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profit-editor__field--product {
    grid-column: span 2;
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

  .profit-editor__meta,
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
