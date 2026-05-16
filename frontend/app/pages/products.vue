<script setup lang="ts">
import type { Product, ProductMutationPayload } from '~/types/product'

definePageMeta({
  title: '商品'
})

const {
  filters,
  filteredProducts,
  machineOptions,
  categoryOptions,
  selectedProduct,
  productMovements,
  loading,
  saving,
  movementsLoading,
  error,
  movementsError,
  updateFilters,
  loadProducts,
  saveProduct,
  archiveProduct,
  updateProductStatus,
  loadProductMovements
} = useProducts()

const formOpen = shallowRef(false)
const historyOpen = shallowRef(false)
const editingProduct = shallowRef<Product | null>(null)

function openCreateDialog() {
  editingProduct.value = null
  formOpen.value = true
}

function openEditDialog(product: Product) {
  editingProduct.value = product
  formOpen.value = true
}

async function submitProduct(payload: ProductMutationPayload) {
  await saveProduct(payload)
  formOpen.value = false
}

async function confirmArchive(product: Product) {
  const confirmed = window.confirm(`确定下架“${product.name}”吗？下架不会修改库存流水，并且不会再出现在首页库存风险和异常列表里。`)
  if (!confirmed) return
  await archiveProduct(product).catch(() => null)
}

async function confirmRestore(product: Product) {
  const confirmed = window.confirm(`确定重新上架“${product.name}”吗？重新上架后会恢复首页库存风险和异常提示。`)
  if (!confirmed) return
  await updateProductStatus(product, 'active').catch(() => null)
}

async function openHistory(product: Product) {
  historyOpen.value = true
  await loadProductMovements(product)
}

async function retryHistory() {
  if (!selectedProduct.value) return
  await loadProductMovements(selectedProduct.value)
}

onMounted(() => {
  loadProducts()
})
</script>

<template>
  <div class="products-page">
    <ProductFilters
      :filters="filters"
      :machines="machineOptions"
      :categories="categoryOptions"
      :result-count="filteredProducts.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadProducts"
      @create="openCreateDialog"
    />

    <ProductTable
      :products="filteredProducts"
      :loading="loading"
      :error="error"
      @edit="openEditDialog"
      @archive="confirmArchive"
      @restore="confirmRestore"
      @movements="openHistory"
      @retry="loadProducts"
    />

    <ProductFormDialog
      v-model:open="formOpen"
      :product="editingProduct"
      :machines="machineOptions"
      :categories="categoryOptions"
      :submitting="saving"
      @submit="submitProduct"
    />

    <ProductHistoryDrawer
      v-model:open="historyOpen"
      :product="selectedProduct"
      :movements="productMovements"
      :loading="movementsLoading"
      :error="movementsError"
      @retry="retryHistory"
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
