<script setup lang="ts">
import type { PurchaseOrder, PurchaseOrderPayload } from '~/types/purchase'

definePageMeta({
  title: '进货'
})

const {
  filteredOrders,
  products,
  filters,
  summary,
  selectedOrder,
  aiCandidates,
  aiMetadata,
  receiptImage,
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
  saveReceiptImage,
  createOrder,
  voidOrder,
  recognizeReceipt,
  setAiCandidates
} = usePurchases()

const formOpen = shallowRef(false)
const aiReviewOpen = shallowRef(false)
const detailOpen = shallowRef(false)
const voidOpen = shallowRef(false)
const voidingOrder = shallowRef<PurchaseOrder | null>(null)

function openCreateDialog() {
  formOpen.value = true
}

function openAiDialog() {
  aiReviewOpen.value = true
}

function openDetail(order: PurchaseOrder) {
  selectedOrder.value = order
  detailOpen.value = true
}

function openVoidDialog(order: PurchaseOrder) {
  voidingOrder.value = order
  voidOpen.value = true
}

async function submitOrder(payload: PurchaseOrderPayload) {
  await createOrder(payload)
  formOpen.value = false
  aiReviewOpen.value = false
}

async function confirmVoid(order: PurchaseOrder) {
  await voidOrder(order)
  voidOpen.value = false
  detailOpen.value = false
}

watch(() => [filters.month, filters.status] as const, () => {
  loadOrders()
})

onMounted(async () => {
  await Promise.all([loadProducts(), loadOrders()])
})
</script>

<template>
  <div class="purchases-page">
    <PurchaseSummaryStrip
      :total-cost="summary.totalCost"
      :quantity="summary.quantity"
      :count="summary.count"
    />

    <PurchaseFilters
      :filters="filters"
      :result-count="filteredOrders.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadOrders"
      @create="openCreateDialog"
      @ai-review="openAiDialog"
    />

    <PurchaseOrderTable
      :orders="filteredOrders"
      :loading="loading"
      :error="error"
      @view="openDetail"
      @void="openVoidDialog"
      @retry="loadOrders"
    />

    <PurchaseFormDialog
      v-model:open="formOpen"
      :products="products"
      :machines="machineOptions"
      :submitting="saving"
      :image-file-name="receiptImage?.fileName"
      @image-selected="saveReceiptImage"
      @submit="submitOrder"
    />

    <PurchaseAiReviewDialog
      v-model:open="aiReviewOpen"
      :candidates="aiCandidates"
      :products="products"
      :recognizing="recognizing"
      :submitting="saving"
      :image-file-name="receiptImage?.fileName"
      :metadata="aiMetadata"
      :progress-message="aiProgress"
      :error-message="aiError?.message"
      @image-selected="saveReceiptImage"
      @recognize="recognizeReceipt"
      @update-candidates="setAiCandidates"
      @confirm="submitOrder"
    />

    <PurchaseOrderDrawer
      v-model:open="detailOpen"
      :order="selectedOrder"
      @void="openVoidDialog"
    />

    <PurchaseVoidDialog
      v-model:open="voidOpen"
      :order="voidingOrder"
      :submitting="voiding"
      @confirm="confirmVoid"
    />
  </div>
</template>

<style scoped>
.purchases-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

@media (max-width: 760px) {
  .purchases-page {
    gap: var(--space-3);
  }
}
</style>
