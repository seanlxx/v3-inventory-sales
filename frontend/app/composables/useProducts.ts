import type { ApiError } from '~/types/api'
import type { StockMovement } from '~/types/inventory'
import type { Product, ProductListFilters, ProductMutationPayload, ProductStatus, ProductStatusPayload } from '~/types/product'
import { displayMachineName, machineMatchesOption, machineOptionsWithDefaults } from '~/utils/machines'

const defaultFilters: ProductListFilters = {
  search: '',
  machineId: 'all',
  category: 'all',
  status: 'active'
}

function productMachines(product: Product): string[] {
  return [
    product.machineId,
    product.stockMachineId
  ].filter((machine): machine is string => Boolean(machine))
}

function machineSearchText(product: Product) {
  return productMachines(product).flatMap((machine) => {
    const displayName = displayMachineName(machine, '')
    return displayName && displayName !== machine ? [machine, displayName] : [machine]
  }).join(' ')
}

function matchesSearch(product: Product, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return `${product.name} ${machineSearchText(product)} ${product.category}`.toLowerCase().includes(keyword)
}

function matchesMachine(product: Product, machineId: string) {
  if (machineId === 'all') return true
  return machineMatchesOption(product.machineId, machineId) || machineMatchesOption(product.stockMachineId, machineId)
}

function normalizeProductPayload(payload: ProductMutationPayload): ProductMutationPayload {
  const normalized: ProductMutationPayload = {
    name: payload.name.trim(),
    machineId: payload.machineId.trim(),
    category: payload.category?.trim() || '其他',
    sellPrice: Number(payload.sellPrice) || 0
  }

  if (payload.id) normalized.id = payload.id
  if (payload.manualCost !== undefined) normalized.manualCost = Number(payload.manualCost) || 0
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
    return machineOptionsWithDefaults(products.value.flatMap(productMachines))
  })

  const productMachineOptions = computed(() => {
    return machineOptionsWithDefaults(products.value.flatMap(productMachines))
  })

  const categoryOptions = computed(() => {
    const categories = new Set(products.value.map(product => product.category || '其他'))
    ;['饮料', '零食', '日用品', '其他'].forEach(category => categories.add(category))
    return Array.from(categories).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const filteredProducts = computed(() =>
    products.value.filter(product => {
      const matchesCategory = filters.category === 'all' || product.category === filters.category
      const matchesStatus = filters.status === 'all' || product.status === filters.status
      return matchesMachine(product, filters.machineId) && matchesCategory && matchesStatus && matchesSearch(product, filters.search)
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
          includeArchived: '1',
          trendDays: '14'
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
    return await updateProductStatus(product, 'archived')
  }

  async function updateProductStatus(product: Product, status: ProductStatus) {
    archiving.value = true
    error.value = null
    try {
      const saved = await request<Product, ProductStatusPayload>('/products', {
        method: 'PATCH',
        body: {
          id: product.id,
          status
        }
      })
      toastStore.show(status === 'archived' ? '商品已下架' : '商品已重新上架', 'success')
      await loadProducts()
      return saved
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
    productMachineOptions,
    categoryOptions,
    updateFilters,
    loadProducts,
    saveProduct,
    archiveProduct,
    updateProductStatus,
    loadProductMovements
  }
}
