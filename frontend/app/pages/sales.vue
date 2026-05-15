<script setup lang="ts">
import type { SalesOrder, SalesOrderPayload, SalesOrderType } from '~/types/sale'

definePageMeta({
  title: '销售'
})

const {
  filteredOrders,
  productOptions,
  filters,
  summary,
  selectedOrder,
  aiCandidates,
  salesImages,
  salesImage,
  machineOptions,
  loading,
  saving,
  voiding,
  recognizing,
  aiProgress,
  error,
  aiError,
  updateFilters,
  loadProducts,
  loadOrders,
  saveSalesImage,
  removeSalesImage,
  createOrder,
  voidOrder,
  recognizeSalesScreenshot,
  setAiCandidates
} = useSales()

const activeType = shallowRef<SalesOrderType>('sale')
const formOpen = shallowRef(false)
const aiReviewOpen = shallowRef(false)
const detailOpen = shallowRef(false)
const voidOpen = shallowRef(false)
const voidingOrder = shallowRef<SalesOrder | null>(null)
const formInventoryError = shallowRef<string | null>(null)

function openCreateDialog() {
  formInventoryError.value = null
  formOpen.value = true
}

function openAiDialog() {
  activeType.value = 'sale'
  formInventoryError.value = null
  aiReviewOpen.value = true
}

function openDetail(order: SalesOrder) {
  selectedOrder.value = order
  detailOpen.value = true
}

function openVoidDialog(order: SalesOrder) {
  voidingOrder.value = order
  voidOpen.value = true
}

async function submitOrder(type: SalesOrderType, payload: SalesOrderPayload) {
  formInventoryError.value = null
  try {
    await createOrder(type, payload)
    formOpen.value = false
    aiReviewOpen.value = false
  } catch (caught) {
    formInventoryError.value = caught && typeof caught === 'object' && 'message' in caught
      ? String(caught.message)
      : '提交失败'
  }
}

async function submitAiOrder(payload: SalesOrderPayload) {
  await submitOrder('sale', payload)
}

async function confirmVoid(order: SalesOrder) {
  await voidOrder(order)
  voidOpen.value = false
  detailOpen.value = false
}

watch(() => [filters.month, filters.type, filters.status, filters.machineId] as const, () => {
  loadOrders()
})

onMounted(async () => {
  await Promise.all([loadProducts(), loadOrders()])
})
</script>

<template>
  <div class="sales-page">
    <SalesModeTabs v-model="activeType" />

    <SalesSummaryStrip
      :sales-amount="summary.salesAmount"
      :refund-amount="summary.refundAmount"
      :loss-quantity="summary.lossQuantity"
      :count="summary.count"
    />

    <SalesFilters
      :filters="filters"
      :machines="machineOptions"
      :result-count="filteredOrders.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadOrders"
      @create="openCreateDialog"
      @ai-review="openAiDialog"
    />

    <SalesOrderTable
      :orders="filteredOrders"
      :loading="loading"
      :error="error"
      @view="openDetail"
      @void="openVoidDialog"
      @retry="loadOrders"
    />

    <SalesOrderDialog
      v-model:open="formOpen"
      :type="activeType"
      :products="productOptions"
      :machines="machineOptions"
      :submitting="saving"
      :image-file-name="salesImage?.fileName"
      :inventory-error="formInventoryError"
      @image-selected="saveSalesImage"
      @submit="submitOrder"
    />

    <SalesAiReviewDialog
      v-model:open="aiReviewOpen"
      :candidates="aiCandidates"
      :products="productOptions"
      :machines="machineOptions"
      :recognizing="recognizing"
      :submitting="saving"
      :images="salesImages"
      :progress-message="aiProgress"
      :error-message="aiError?.message"
      :inventory-error="formInventoryError"
      @image-selected="saveSalesImage"
      @image-removed="removeSalesImage"
      @recognize="recognizeSalesScreenshot"
      @update-candidates="setAiCandidates"
      @confirm="submitAiOrder"
    />

    <SalesOrderDrawer
      v-model:open="detailOpen"
      :order="selectedOrder"
      @void="openVoidDialog"
    />

    <SalesVoidDialog
      v-model:open="voidOpen"
      :order="voidingOrder"
      :submitting="voiding"
      @confirm="confirmVoid"
    />
  </div>
</template>

<style scoped>
.sales-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

@media (max-width: 760px) {
  .sales-page {
    gap: var(--space-3);
  }
}
</style>
