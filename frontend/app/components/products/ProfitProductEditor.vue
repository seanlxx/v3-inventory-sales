<script setup lang="ts">
import type { ProfitProduct, ProfitProductPayload } from '~/types/profit'

const props = defineProps<{
  product?: ProfitProduct | null
  categories: readonly string[]
  saving?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ProfitProductPayload]
  cancel: []
}>()

const draft = reactive({
  productName: '',
  category: '其他',
  defaultSellPrice: 0,
  status: 'active' as ProfitProductPayload['status']
})

const title = computed(() => props.product ? '编辑商品' : '新增商品')

function syncDraft() {
  draft.productName = props.product?.productName || ''
  draft.category = props.product?.category || '其他'
  draft.defaultSellPrice = props.product?.defaultSellPrice || 0
  draft.status = props.product?.status || 'active'
}

function submit() {
  emit('submit', {
    id: props.product?.productGlobalId,
    productName: draft.productName,
    category: draft.category,
    defaultSellPrice: Number(draft.defaultSellPrice) || 0,
    status: draft.status
  })
}

watch(() => props.product, syncDraft, { immediate: true })
</script>

<template>
  <section class="profit-editor surface-panel" aria-label="商品编辑">
    <header class="profit-editor__header">
      <h2>{{ title }}</h2>
      <AppButton type="button" variant="ghost" @click="emit('cancel')">
        关闭
      </AppButton>
    </header>

    <form class="profit-editor__form" @submit.prevent="submit">
      <AppInput v-model="draft.productName" label="商品名称" autocomplete="off" />
      <label class="profit-editor__field">
        <span>分类</span>
        <input v-model="draft.category" list="profit-product-categories" autocomplete="off">
        <datalist id="profit-product-categories">
          <option v-for="category in props.categories" :key="category" :value="category" />
        </datalist>
      </label>
      <AppInput v-model="draft.defaultSellPrice" label="默认售价" type="number" step="0.01" />
      <label class="profit-editor__field">
        <span>状态</span>
        <select v-model="draft.status">
          <option value="active">在售</option>
          <option value="archived">已归档</option>
        </select>
      </label>
      <div class="profit-editor__actions">
        <AppButton type="button" variant="secondary" @click="emit('cancel')">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.saving">
          保存商品
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
  grid-template-columns: 1.3fr 1fr 0.8fr 0.7fr auto;
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

.profit-editor__field input,
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

@media (max-width: 980px) {
  .profit-editor__form {
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

  .profit-editor__actions {
    display: grid;
  }
}
</style>
