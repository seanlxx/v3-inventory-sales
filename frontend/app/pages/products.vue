<script setup lang="ts">
import { useProfitProducts } from '~/composables/useProfitProducts'
import type { ProfitProduct, ProfitProductPayload } from '~/types/profit'

definePageMeta({
  title: '商品'
})

const toast = useToastStore()
const {
  filters,
  filteredProducts,
  categoryOptions,
  loading,
  saving,
  error,
  updateFilters,
  loadProducts,
  saveProduct,
  updateProductStatus
} = useProfitProducts()

const showEditor = shallowRef(false)
const editingProduct = shallowRef<ProfitProduct | null>(null)

function openCreate() {
  editingProduct.value = null
  showEditor.value = true
}

function openEdit(product: ProfitProduct) {
  editingProduct.value = product
  showEditor.value = true
}

async function submitProduct(payload: ProfitProductPayload) {
  await saveProduct(payload)
  showEditor.value = false
  editingProduct.value = null
  toast.show('商品已保存', 'success')
}

async function changeProductStatus(product: ProfitProduct, status: ProfitProduct['status']) {
  await updateProductStatus(product.productGlobalId, status)
  toast.show(status === 'archived' ? '商品已归档' : '商品已恢复', 'success')
}

onMounted(() => {
  loadProducts()
})
</script>

<template>
  <div class="products-page">
    <div class="products-page__actions">
      <AppButton type="button" @click="openCreate">
        新增商品
      </AppButton>
    </div>

    <ProfitProductEditor
      v-if="showEditor"
      :product="editingProduct"
      :categories="categoryOptions"
      :saving="saving"
      @submit="submitProduct"
      @cancel="showEditor = false"
    />

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
      @edit="openEdit"
      @update-status="changeProductStatus"
    />
  </div>
</template>

<style scoped>
.products-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.products-page__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .products-page {
    gap: var(--space-3);
  }

  .products-page__actions {
    display: grid;
  }
}
</style>
