<script setup lang="ts">
import type { Product } from '~/types/product'
import type { PurchaseItem, PurchaseOrderPayload } from '~/types/purchase'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  products: readonly Product[]
  machines: readonly string[]
  submitting?: boolean
  imageFileName?: string
}>()

const emit = defineEmits<{
  submit: [payload: PurchaseOrderPayload]
  imageSelected: [file: File]
}>()

const date = shallowRef(new Date().toISOString().slice(0, 10))
const machineId = shallowRef('')
const source = shallowRef('拼多多')
const note = shallowRef('')
const items = shallowRef<PurchaseItem[]>([])
const formError = shallowRef('')

function resetForm() {
  date.value = new Date().toISOString().slice(0, 10)
  machineId.value = props.machines[0] || ''
  source.value = '拼多多'
  note.value = ''
  items.value = []
  formError.value = ''
}

watch(open, value => {
  if (value) resetForm()
})

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('imageSelected', file)
}

function submitForm() {
  const validItems = items.value.filter(item => item.productId && Number(item.quantity) > 0 && Number(item.totalPrice) > 0)
  if (!date.value) {
    formError.value = '请选择进货日期'
    return
  }
  if (!validItems.length) {
    formError.value = '请至少添加一条有效商品明细'
    return
  }
  formError.value = ''
  emit('submit', {
    date: date.value,
    machineId: machineId.value || undefined,
    source: source.value.trim() || '拼多多',
    note: note.value.trim(),
    items: validItems
  })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="新建进货单"
    description="以单据为中心录入，多商品确认后一次入库。"
  >
    <form class="purchase-form" @submit.prevent="submitForm">
      <div class="purchase-form__grid">
        <AppInput v-model="date" label="进货日期" type="date" />
        <label class="purchase-form__field">
          <span>售货机</span>
          <select v-model="machineId" class="purchase-form__select">
            <option value="">按商品所属机器</option>
            <option v-for="machine in props.machines" :key="machine" :value="machine">
              {{ machine }}
            </option>
          </select>
        </label>
        <AppInput v-model="source" label="供应商/平台" placeholder="拼多多" />
        <AppInput v-model="note" label="备注" placeholder="可选" />
      </div>

      <label class="purchase-form__upload">
        <span>进货截图</span>
        <input type="file" accept="image/*" @change="handleFileChange">
        <strong>{{ props.imageFileName || '可选，随进货单一起上传' }}</strong>
      </label>

      <PurchaseItemsEditor v-model="items" :products="props.products" />

      <p v-if="formError" class="purchase-form__error">
        {{ formError }}
      </p>

      <div class="purchase-form__actions">
        <AppButton variant="secondary" @click="open = false">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.submitting">
          确认入库
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.purchase-form {
  display: grid;
  gap: var(--space-4);
}

.purchase-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.purchase-form__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.purchase-form__field span,
.purchase-form__upload span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.purchase-form__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.purchase-form__upload {
  display: grid;
  gap: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.purchase-form__upload input {
  min-height: 44px;
}

.purchase-form__upload strong {
  color: var(--color-text-muted);
  font-size: 13px;
}

.purchase-form__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.purchase-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .purchase-form__grid {
    grid-template-columns: 1fr;
  }

  .purchase-form__select {
    min-height: var(--control-height-mobile);
  }

  .purchase-form__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
