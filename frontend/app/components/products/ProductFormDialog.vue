<script setup lang="ts">
import type { Product, ProductMutationPayload } from '~/types/product'
import { canonicalMachineOption } from '~/utils/machines'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  product?: Product | null
  machines: readonly string[]
  categories: readonly string[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ProductMutationPayload]
}>()

const draft = reactive<ProductMutationPayload>({
  name: '',
  machineId: '',
  category: '其他',
  sellPrice: 0,
  manualCost: 0
})

const formError = shallowRef('')
const dialogTitle = computed(() => props.product ? '编辑商品' : '新增商品')
const dialogDescription = computed(() => '只维护商品主数据，库存请通过进货、销售或盘点生成流水。')

function resetDraft() {
  draft.id = props.product?.id
  draft.name = props.product?.name || ''
  draft.machineId = canonicalMachineOption(props.product?.machineId) || props.machines[0] || '1号机'
  draft.category = props.product?.category || props.categories[0] || '其他'
  draft.sellPrice = props.product?.sellPrice || 0
  draft.manualCost = props.product?.manualCost || 0
  formError.value = ''
}

function submitForm() {
  if (!draft.name.trim()) {
    formError.value = '请输入商品名称'
    return
  }
  if (!draft.machineId.trim()) {
    formError.value = '请选择售货机'
    return
  }
  if (Number(draft.sellPrice) < 0) {
    formError.value = '售价不能小于 0'
    return
  }
  if (Number(draft.manualCost) < 0) {
    formError.value = '成本不能小于 0'
    return
  }
  emit('submit', {
    ...draft,
    sellPrice: Number(draft.sellPrice) || 0,
    manualCost: Number(draft.manualCost) || 0
  })
}

watch(open, (isOpen) => {
  if (isOpen) resetDraft()
})

watch(() => props.product, () => {
  if (open.value) resetDraft()
})
</script>

<template>
  <AppDialog v-model:open="open" :title="dialogTitle" :description="dialogDescription">
    <form class="product-form" @submit.prevent="submitForm">
      <AppInput v-model="draft.name" label="商品名称" placeholder="如：可口可乐 330ml" />

      <label class="product-form__field">
        <span class="product-form__label">所属售货机</span>
        <select v-model="draft.machineId" class="product-form__select">
          <option v-for="machine in props.machines" :key="machine" :value="machine">
            {{ machine }}
          </option>
          <option v-if="props.machines.length === 0" value="1号机">
            1号机
          </option>
        </select>
      </label>

      <label class="product-form__field">
        <span class="product-form__label">商品分类</span>
        <select v-model="draft.category" class="product-form__select">
          <option v-for="category in props.categories" :key="category" :value="category">
            {{ category }}
          </option>
          <option v-if="props.categories.length === 0" value="其他">
            其他
          </option>
        </select>
      </label>

      <AppInput v-model="draft.sellPrice" label="售价" type="number" step="0.01" placeholder="0.00" />

      <AppInput
        v-model="draft.manualCost"
        label="手动成本"
        type="number"
        step="0.01"
        placeholder="0.00"
        hint="用于没有成本的商品；保存后只回填成本为 0 的历史销售和损耗利润。"
      />

      <div class="product-form__notice">
        库存、累计进货数量只读，不能在商品表单里直接修改。
      </div>

      <p v-if="formError" class="product-form__error">
        {{ formError }}
      </p>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="open = false">
        取消
      </AppButton>
      <AppButton :loading="props.submitting" @click="submitForm">
        保存
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.product-form {
  display: grid;
  gap: var(--space-4);
}

.product-form__field {
  display: grid;
  gap: 6px;
}

.product-form__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.product-form__select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.product-form__notice {
  border: 1px solid rgb(15 118 110 / 26%);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-info-soft);
  color: var(--color-info);
  line-height: 1.6;
}

.product-form__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

@media (max-width: 760px) {
  .product-form__select {
    min-height: var(--control-height-mobile);
  }
}
</style>
