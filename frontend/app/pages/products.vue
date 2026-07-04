<script setup lang="ts">
import { useProfitProducts } from '~/composables/useProfitProducts'

definePageMeta({
  title: '商品'
})

const {
  filters,
  filteredProducts,
  categoryOptions,
  loading,
  error,
  updateFilters,
  loadProducts
} = useProfitProducts()

onMounted(() => {
  loadProducts()
})
</script>

<template>
  <div class="products-page">
    <ProfitProductFilters
      :filters="filters"
      :categories="categoryOptions"
      :result-count="filteredProducts.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadProducts"
    />

    <ProfitProductTable
      :products="filteredProducts"
      :loading="loading"
      :error="error"
      @retry="loadProducts"
    />
  </div>
</template>

<style scoped>
.products-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

@media (max-width: 760px) {
  .products-page {
    gap: var(--space-3);
  }
}
</style>
