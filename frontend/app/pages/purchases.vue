<script setup lang="ts">
import { useProfitPurchases } from '~/composables/useProfitPurchases'

definePageMeta({
  title: '进货'
})

const {
  records,
  filters,
  summary,
  loading,
  error,
  updateFilters,
  loadRecords
} = useProfitPurchases()

watch(() => [filters.month, filters.status, filters.search] as const, () => {
  loadRecords()
})

onMounted(() => {
  loadRecords()
})
</script>

<template>
  <div class="purchases-page">
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
