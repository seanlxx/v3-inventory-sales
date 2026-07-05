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

const draft = reactive({
  recordDate: today(),
  productGlobalId: '',
  quantity: 1,
  unitCost: 0,
  note: ''
})

const title = computed(() => props.record ? '编辑进货' : '新增进货')

const productOptions = computed(() =>
  props.products.filter(product => product.status === 'active')
)

function syncDraft() {
  const item = props.record?.items[0]
  draft.recordDate = props.record?.recordDate || today()
  draft.productGlobalId = item?.productGlobalId || productOptions.value[0]?.productGlobalId || ''
  draft.quantity = item?.quantity || 1
  draft.unitCost = item?.unitCost || 0
  draft.note = props.record?.note || ''
}

function submit() {
  emit('submit', {
    id: props.record?.id,
    recordDate: draft.recordDate,
    source: 'manual',
    note: draft.note,
    items: [{
      productGlobalId: draft.productGlobalId,
      quantity: Number(draft.quantity) || 0,
      unitCost: Number(draft.unitCost) || 0
    }]
  })
}

watch([() => props.record, productOptions], syncDraft, { immediate: true })
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
      <AppInput v-model="draft.recordDate" label="日期" type="date" />
      <label class="profit-editor__field profit-editor__field--product">
        <span>商品</span>
        <select v-model="draft.productGlobalId">
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
      <AppInput v-model="draft.quantity" label="数量" type="number" step="1" />
      <AppInput v-model="draft.unitCost" label="单件成本" type="number" step="0.01" />
      <AppInput v-model="draft.note" label="备注" autocomplete="off" />
      <div class="profit-editor__actions">
        <AppButton type="button" variant="secondary" @click="emit('cancel')">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.saving" :disabled="!draft.productGlobalId">
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
  grid-template-columns: 0.8fr 1.5fr 0.6fr 0.8fr 1fr auto;
  gap: var(--space-3);
  align-items: end;
}

.profit-editor__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.profit-editor__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
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

  .profit-editor__field--product,
  .profit-editor__actions {
    grid-column: auto;
  }

  .profit-editor__actions {
    display: grid;
  }
}
</style>
