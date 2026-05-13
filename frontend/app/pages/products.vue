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
  archiving,
  movementsLoading,
  error,
  movementsError,
  updateFilters,
  loadProducts,
  saveProduct,
  archiveProduct,
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
  const confirmed = window.confirm(`确定归档“${product.name}”吗？归档不会修改库存流水。`)
  if (!confirmed) return
  await archiveProduct(product).catch(() => null)
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
    <header class="products-page__header">
      <div>
        <h1 class="products-page__title">商品</h1>
        <p class="products-page__description">
          管理商品主数据；库存只展示服务端余额，变化来源以 stock_movements 为准。
        </p>
      </div>
      <StatusBadge :label="archiving ? '归档中' : '库存只读'" :tone="archiving ? 'warning' : 'info'" />
    </header>

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

.products-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.products-page__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.products-page__description {
  max-width: 760px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 760px) {
  .products-page {
    gap: var(--space-3);
  }

  .products-page__header {
    display: grid;
  }

  .products-page__title {
    font-size: 20px;
  }
}
</style>
