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
  receiptImage,
  machineOptions,
  loading,
  saving,
  voiding,
  recognizing,
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
    <header class="purchases-page__header">
      <div>
        <h1 class="purchases-page__title">进货</h1>
        <p class="purchases-page__description">
          以进货单为中心录入，多商品明细确认后由服务端创建入库流水；AI 识别必须人工确认后才能入账。
        </p>
      </div>
      <StatusBadge label="确认后入库" tone="success" />
    </header>

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

.purchases-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.purchases-page__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.purchases-page__description {
  max-width: 860px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 760px) {
  .purchases-page {
    gap: var(--space-3);
  }

  .purchases-page__header {
    display: grid;
  }

  .purchases-page__title {
    font-size: 20px;
  }
}
</style>
