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
const aliases = computed(() => props.product?.aliases ?? [])

function aliasSourceLabel(source: string) {
  if (source === 'legacy-products') return '旧商品'
  if (source === 'manual') return '手工'
  return source || '来源'
}

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

    <section v-if="aliases.length" class="profit-editor__aliases" aria-label="商品别名">
      <header class="profit-editor__alias-header">
        <h3>合并别名</h3>
        <StatusBadge :label="`${aliases.length} 个`" tone="info" />
      </header>
      <div class="profit-editor__alias-list">
        <article
          v-for="alias in aliases"
          :key="alias.id"
          class="profit-editor__alias"
        >
          <div class="profit-editor__alias-main">
            <strong>{{ alias.aliasName }}</strong>
            <span>{{ alias.normalizedAlias }}</span>
          </div>
          <div class="profit-editor__alias-meta">
            <span>{{ aliasSourceLabel(alias.source) }}</span>
            <span v-if="alias.sourceMachineId">{{ alias.sourceMachineId }}</span>
            <span v-if="alias.sourceProductId">{{ alias.sourceProductId }}</span>
          </div>
        </article>
      </div>
    </section>
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

.profit-editor__aliases {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.profit-editor__alias-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.profit-editor__alias-header h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.3;
}

.profit-editor__alias-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.profit-editor__alias {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.profit-editor__alias-main,
.profit-editor__alias-meta {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.profit-editor__alias-main strong {
  max-width: 100%;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-editor__alias-main span,
.profit-editor__alias-meta span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.profit-editor__alias-meta span {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-2);
  background: var(--color-surface);
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

  .profit-editor__alias-list {
    grid-template-columns: 1fr;
  }
}
</style>
