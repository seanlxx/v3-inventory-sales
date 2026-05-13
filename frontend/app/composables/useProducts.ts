import type { ApiError } from '~/types/api'
import type { StockMovement } from '~/types/inventory'
import type { Product, ProductListFilters, ProductMutationPayload } from '~/types/product'

const defaultFilters: ProductListFilters = {
  search: '',
  machineId: 'all',
  category: 'all',
  status: 'active'
}

function matchesSearch(product: Product, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return `${product.name} ${product.machineId} ${product.category}`.toLowerCase().includes(keyword)
}

function normalizeProductPayload(payload: ProductMutationPayload): ProductMutationPayload {
  const normalized: ProductMutationPayload = {
    name: payload.name.trim(),
    machineId: payload.machineId.trim(),
    category: payload.category?.trim() || '其他',
    sellPrice: Number(payload.sellPrice) || 0
  }

  if (payload.id) normalized.id = payload.id
  if (payload.imageAssetId !== undefined) normalized.imageAssetId = payload.imageAssetId
  return normalized
}

export function useProducts() {
  const { request } = useApi()
  const toastStore = useToastStore()

  const products = shallowRef<Product[]>([])
  const productMovements = shallowRef<StockMovement[]>([])
  const filters = reactive<ProductListFilters>({ ...defaultFilters })
  const selectedProduct = shallowRef<Product | null>(null)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const archiving = shallowRef(false)
  const movementsLoading = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)
  const movementsError = shallowRef<ApiError | null>(null)

  const machineOptions = computed(() => {
    const machines = new Set(products.value.map(product => product.machineId).filter(Boolean))
    if (machines.size === 0) {
      machines.add('1号机')
      machines.add('2号机')
    }
    return Array.from(machines).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const categoryOptions = computed(() => {
    const categories = new Set(products.value.map(product => product.category || '其他'))
    ;['饮料', '零食', '日用品', '其他'].forEach(category => categories.add(category))
    return Array.from(categories).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const filteredProducts = computed(() =>
    products.value.filter(product => {
      const matchesMachine = filters.machineId === 'all' || product.machineId === filters.machineId
      const matchesCategory = filters.category === 'all' || product.category === filters.category
      const matchesStatus = filters.status === 'all' || product.status === filters.status
      return matchesMachine && matchesCategory && matchesStatus && matchesSearch(product, filters.search)
    })
  )

  function updateFilters(nextFilters: Partial<ProductListFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadProducts() {
    loading.value = true
    error.value = null
    try {
      products.value = await request<Product[]>('/products', {
        query: {
          includeArchived: '1'
        }
      })
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveProduct(payload: ProductMutationPayload) {
    saving.value = true
    error.value = null
    try {
      const body = normalizeProductPayload(payload)
      const saved = await request<Product, ProductMutationPayload>('/products', {
        method: payload.id ? 'PUT' : 'POST',
        body
      })
      toastStore.show(payload.id ? '商品已更新' : '商品已新增', 'success')
      await loadProducts()
      return saved
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      saving.value = false
    }
  }

  async function archiveProduct(product: Product) {
    archiving.value = true
    error.value = null
    try {
      await request<null>('/products', {
        method: 'DELETE',
        query: { id: product.id }
      })
      toastStore.show('商品已归档', 'success')
      await loadProducts()
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      archiving.value = false
    }
  }

  async function loadProductMovements(product: Product) {
    selectedProduct.value = product
    productMovements.value = []
    movementsLoading.value = true
    movementsError.value = null
    try {
      productMovements.value = await request<StockMovement[]>('/inventory/movements', {
        query: {
          productId: product.id,
          limit: 50
        }
      })
    } catch (caught) {
      movementsError.value = normalizeApiError(caught)
    } finally {
      movementsLoading.value = false
    }
  }

  return {
    products,
    productMovements,
    filters,
    selectedProduct,
    loading,
    saving,
    archiving,
    movementsLoading,
    error,
    movementsError,
    filteredProducts,
    machineOptions,
    categoryOptions,
    updateFilters,
    loadProducts,
    saveProduct,
    archiveProduct,
    loadProductMovements
  }
}
