<script setup lang="ts">
import { useProfitSales } from '~/composables/useProfitSales'
import { useProfitProducts } from '~/composables/useProfitProducts'
import type { ProfitSalesPayload, ProfitSalesRecord } from '~/types/profit'

definePageMeta({
  title: '销售'
})

const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const {
  records,
  filters,
  summary,
  machineOptions,
  loading,
  saving,
  error,
  updateFilters,
  loadRecords,
  saveRecord,
  voidRecord
} = useProfitSales()

const {
  products,
  loadProducts
} = useProfitProducts()

const showEditor = shallowRef(false)
const editingRecord = shallowRef<ProfitSalesRecord | null>(null)
const viewingRecord = shallowRef<ProfitSalesRecord | null>(null)

function queryText(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '')
  return String(value || '')
}

function applyProductFilterQuery() {
  const productFilterId = queryText(route.query.productFilterId)
  if (!productFilterId) return
  updateFilters({
    productGlobalId: productFilterId,
    month: queryText(route.query.month) || 'all',
    type: 'all',
    status: 'all',
    search: ''
  })
}

function clearProductFilter() {
  const nextQuery = { ...route.query }
  delete nextQuery.productFilterId
  if (nextQuery.month === 'all' || nextQuery.month === '全部') delete nextQuery.month
  router.replace({ query: nextQuery })
  updateFilters({ productGlobalId: '' })
}

function openCreate() {
  editingRecord.value = null
  viewingRecord.value = null
  showEditor.value = true
}

function openEdit(record: ProfitSalesRecord) {
  editingRecord.value = record
  viewingRecord.value = null
  showEditor.value = true
}

function openView(record: ProfitSalesRecord) {
  showEditor.value = false
  editingRecord.value = null
  viewingRecord.value = record
}

function closeEditor() {
  showEditor.value = false
  editingRecord.value = null
}

async function submitRecord(payload: ProfitSalesPayload) {
  await saveRecord(payload)
  closeEditor()
  toast.show('销售已保存', 'success')
}

async function voidSale(record: ProfitSalesRecord) {
  if (!window.confirm('确认作废这笔销售？')) return
  await voidRecord(record.id)
  toast.show('销售已作废', 'success')
}

watch(() => [filters.month, filters.type, filters.status, filters.machineId, filters.search, filters.productGlobalId] as const, () => {
  loadRecords()
})

watch(() => [route.query.productFilterId, route.query.month] as const, () => {
  applyProductFilterQuery()
}, { immediate: true })

onMounted(() => {
  loadRecords()
  loadProducts()
})
</script>

<template>
  <div class="sales-page">
    <div class="sales-page__actions">
      <AppButton type="button" @click="openCreate()">
        新增销售
      </AppButton>
    </div>

    <ProfitSalesEditor
      v-if="showEditor"
      :record="editingRecord"
      :products="products"
      :machines="machineOptions"
      :saving="saving"
      @submit="submitRecord"
      @cancel="closeEditor"
    />

    <ProfitSalesDetail
      v-if="viewingRecord"
      :record="viewingRecord"
      @close="viewingRecord = null"
    />

    <SalesSummaryStrip
      :sales-amount="summary.salesAmount"
      :refund-amount="summary.refundAmount"
      :net-revenue="summary.netRevenue"
      :gross-profit="summary.grossProfit"
      :count="summary.count"
    />

    <ProfitSalesFilters
      :filters="filters"
      :machines="machineOptions"
      :result-count="records.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadRecords"
      @clear-product-filter="clearProductFilter"
    />

    <ProfitSalesTable
      :records="records"
      :loading="loading"
      :error="error"
      @retry="loadRecords"
      @view="openView"
      @edit="openEdit"
      @void="voidSale"
    />
  </div>
</template>

<style scoped>
.sales-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.sales-page__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .sales-page {
    gap: var(--space-3);
  }

  .sales-page__actions {
    display: grid;
  }
}
</style>
