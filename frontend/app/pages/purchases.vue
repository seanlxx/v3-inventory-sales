<script setup lang="ts">
import { useProfitPurchases } from '~/composables/useProfitPurchases'
import { useProfitProducts } from '~/composables/useProfitProducts'
import type { ProfitPurchasePayload, ProfitPurchaseRecord } from '~/types/profit'

definePageMeta({
  title: '进货'
})

const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const {
  records,
  filters,
  summary,
  loading,
  saving,
  error,
  updateFilters,
  loadRecords,
  saveRecord,
  voidRecord
} = useProfitPurchases()

const {
  products,
  loadProducts
} = useProfitProducts()

const showEditor = shallowRef(false)
const editingRecord = shallowRef<ProfitPurchaseRecord | null>(null)
const initialProductGlobalId = shallowRef<string | null>(null)

function queryText(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '')
  return String(value || '')
}

function clearProductQuery() {
  if (!route.query.productGlobalId) return
  const nextQuery = { ...route.query }
  delete nextQuery.productGlobalId
  router.replace({ query: nextQuery })
}

function openCreate(productGlobalId: string | null = null) {
  editingRecord.value = null
  initialProductGlobalId.value = productGlobalId
  showEditor.value = true
  if (!productGlobalId) clearProductQuery()
}

function openEdit(record: ProfitPurchaseRecord) {
  editingRecord.value = record
  initialProductGlobalId.value = null
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
  editingRecord.value = null
  initialProductGlobalId.value = null
  clearProductQuery()
}

async function submitRecord(payload: ProfitPurchasePayload) {
  await saveRecord(payload)
  closeEditor()
  toast.show('进货已保存', 'success')
}

async function voidPurchase(record: ProfitPurchaseRecord) {
  if (!window.confirm('确认作废这笔进货？')) return
  await voidRecord(record.id)
  toast.show('进货已作废', 'success')
}

watch(() => [filters.month, filters.status, filters.search] as const, () => {
  loadRecords()
})

watch(() => route.query.productGlobalId, value => {
  const productGlobalId = queryText(value)
  if (productGlobalId) openCreate(productGlobalId)
}, { immediate: true })

onMounted(() => {
  loadRecords()
  loadProducts()
})
</script>

<template>
  <div class="purchases-page">
    <div class="purchases-page__actions">
      <AppButton type="button" @click="openCreate()">
        新增进货
      </AppButton>
    </div>

    <ProfitPurchaseEditor
      v-if="showEditor"
      :record="editingRecord"
      :products="products"
      :initial-product-global-id="initialProductGlobalId"
      :saving="saving"
      @submit="submitRecord"
      @cancel="closeEditor"
    />

    <PurchaseSummaryStrip
      :total-cost="summary.totalCost"
      :quantity="summary.quantity"
      :count="summary.count"
    />

    <ProfitPurchaseFilters
      :filters="filters"
      :result-count="records.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadRecords"
    />

    <ProfitPurchaseTable
      :records="records"
      :loading="loading"
      :error="error"
      @retry="loadRecords"
      @edit="openEdit"
      @void="voidPurchase"
    />
  </div>
</template>

<style scoped>
.purchases-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.purchases-page__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .purchases-page {
    gap: var(--space-3);
  }

  .purchases-page__actions {
    display: grid;
  }
}
</style>
