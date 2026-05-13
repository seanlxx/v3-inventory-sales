<script setup lang="ts">
import type { Product } from '~/types/product'
import type { SalesItem, SalesOrderPayload, SalesOrderType } from '~/types/sale'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  type: SalesOrderType
  products: readonly Product[]
  machines: readonly string[]
  submitting?: boolean
  imageFileName?: string
  inventoryError?: string | null
}>()

const emit = defineEmits<{
  submit: [type: SalesOrderType, payload: SalesOrderPayload]
  imageSelected: [file: File]
}>()

const date = shallowRef(new Date().toISOString().slice(0, 10))
const machineId = shallowRef('')
const note = shallowRef('')
const items = shallowRef<SalesItem[]>([])
const formError = shallowRef('')

const copy = computed(() => {
  if (props.type === 'refund') {
    return {
      title: '新建退款单',
      description: '退款单使用正数数量，提交后由服务端按退款类型回补库存。',
      submit: '确认退款'
    }
  }
  if (props.type === 'loss') {
    return {
      title: '新建损耗单',
      description: '损耗单使用正数数量，提交后由服务端按损耗类型扣减库存。',
      submit: '确认损耗'
    }
  }
  return {
    title: '新建销售单',
    description: '销售单使用正数数量，提交后由服务端按销售类型扣减库存。',
    submit: '确认销售'
  }
})

function resetForm() {
  date.value = new Date().toISOString().slice(0, 10)
  machineId.value = props.machines[0] || ''
  note.value = ''
  items.value = []
  formError.value = ''
}

watch(open, value => {
  if (value) resetForm()
})

watch(() => props.type, () => {
  if (open.value) resetForm()
})

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('imageSelected', file)
}

function submitForm() {
  const validItems = items.value.filter(item => item.productId && Number(item.quantity) > 0)
  if (!date.value) {
    formError.value = '请选择日期'
    return
  }
  if (!validItems.length) {
    formError.value = '请至少添加一条有效商品明细'
    return
  }
  formError.value = ''
  emit('submit', props.type, {
    date: date.value,
    machineId: machineId.value || undefined,
    note: note.value.trim(),
    items: validItems
  })
}
</script>

<template>
  <AppDialog v-model:open="open" :title="copy.title" :description="copy.description">
    <form class="sales-form" @submit.prevent="submitForm">
      <div class="sales-form__grid">
        <AppInput v-model="date" label="日期" type="date" />
        <label class="sales-form__field">
          <span>售货机</span>
          <select v-model="machineId" class="sales-form__select">
            <option value="">按商品所属机器</option>
            <option v-for="machine in props.machines" :key="machine" :value="machine">
              {{ machine }}
            </option>
          </select>
        </label>
        <AppInput v-model="note" label="备注" placeholder="可选" />
      </div>

      <label class="sales-form__upload">
        <span>销售截图</span>
        <input type="file" accept="image/*" @change="handleFileChange">
        <strong>{{ props.imageFileName || '可选，随单据一起上传' }}</strong>
      </label>

      <SalesItemsEditor v-model="items" :products="props.products" :type="props.type" />

      <p v-if="formError || props.inventoryError" class="sales-form__error">
        {{ formError || props.inventoryError }}
      </p>

      <div class="sales-form__actions">
        <AppButton variant="secondary" @click="open = false">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.submitting">
          {{ copy.submit }}
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.sales-form {
  display: grid;
  gap: var(--space-4);
}

.sales-form__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-form__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.sales-form__field span,
.sales-form__upload span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.sales-form__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.sales-form__upload {
  display: grid;
  gap: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.sales-form__upload input {
  min-height: 44px;
}

.sales-form__upload strong {
  color: var(--color-text-muted);
  font-size: 13px;
}

.sales-form__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.sales-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .sales-form__grid {
    grid-template-columns: 1fr;
  }

  .sales-form__select {
    min-height: var(--control-height-mobile);
  }

  .sales-form__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
