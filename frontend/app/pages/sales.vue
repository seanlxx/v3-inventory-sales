<script setup lang="ts">
import { useProfitSales } from '~/composables/useProfitSales'

definePageMeta({
  title: '销售'
})

const {
  records,
  filters,
  summary,
  machineOptions,
  loading,
  error,
  updateFilters,
  loadRecords
} = useProfitSales()

watch(() => [filters.month, filters.type, filters.status, filters.machineId, filters.search] as const, () => {
  loadRecords()
})

onMounted(() => {
  loadRecords()
})
</script>

<template>
  <div class="sales-page">
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
    />

    <ProfitSalesTable
      :records="records"
      :loading="loading"
      :error="error"
      @retry="loadRecords"
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
