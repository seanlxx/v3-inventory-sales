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

const draft = reactive({
  type: 'sale' as ProfitSalesPayload['type'],
  machineId: '1号机',
  recordDate: today(),
  productGlobalId: '',
  quantity: 1,
  unitPrice: 0,
  unitCost: 0,
  platformFee: 0,
  serviceFee: 0,
  discount: 0,
  externalId: '',
  note: ''
})

const title = computed(() => props.record ? '编辑销售' : '新增销售')

const productOptions = computed(() =>
  props.products.filter(product => product.status === 'active')
)

const machineOptions = computed(() =>
  props.machines.filter(machine => machine !== 'all')
)

function syncDraft() {
  const item = props.record?.items[0]
  draft.type = props.record?.type || 'sale'
  draft.machineId = props.record?.machineId || machineOptions.value[0] || '1号机'
  draft.recordDate = props.record?.recordDate || today()
  draft.productGlobalId = item?.productGlobalId || productOptions.value[0]?.productGlobalId || ''
  draft.quantity = item?.quantity || 1
  draft.unitPrice = item?.unitPrice || 0
  draft.unitCost = item?.unitCost || 0
  draft.platformFee = props.record?.platformFee || 0
  draft.serviceFee = props.record?.serviceFee || 0
  draft.discount = props.record?.discount || 0
  draft.externalId = props.record?.externalId || ''
  draft.note = props.record?.note || ''
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
    items: [{
      productGlobalId: draft.productGlobalId,
      quantity: Number(draft.quantity) || 0,
      unitPrice: Number(draft.unitPrice) || 0,
      unitCost: Number(draft.unitCost) || 0
    }]
  })
}

watch([() => props.record, productOptions, machineOptions], syncDraft, { immediate: true })
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
      <AppInput v-model="draft.unitPrice" label="单价" type="number" step="0.01" />
      <AppInput v-model="draft.unitCost" label="单位成本" type="number" step="0.01" />
      <AppInput v-model="draft.platformFee" label="手续费" type="number" step="0.01" />
      <AppInput v-model="draft.serviceFee" label="服务费" type="number" step="0.01" />
      <AppInput v-model="draft.discount" label="优惠" type="number" step="0.01" />
      <AppInput v-model="draft.externalId" label="外部单号" autocomplete="off" />
      <AppInput v-model="draft.note" label="备注" autocomplete="off" />
      <div class="profit-editor__actions">
        <AppButton type="button" variant="secondary" @click="emit('cancel')">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.saving" :disabled="!draft.productGlobalId">
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
