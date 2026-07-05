import type { ApiError } from '~/types/api'
import type {
  ProfitProduct,
  ProfitProductFilters,
  ProfitProductMutationResponse,
  ProfitProductPayload,
  ProfitProductsResponse
} from '~/types/profit'

const defaultFilters: ProfitProductFilters = {
  search: '',
  category: 'all',
  status: 'active'
}

function matchesSearch(product: ProfitProduct, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return `${product.productName} ${product.normalizedName} ${product.category}`.toLowerCase().includes(keyword)
}

export function useProfitProducts() {
  const { request } = useApi()

  const products = shallowRef<ProfitProduct[]>([])
  const filters = reactive<ProfitProductFilters>({ ...defaultFilters })
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  const categoryOptions = computed(() => {
    const categories = new Set(products.value.map(product => product.category || '其他'))
    ;['饮料', '零食', '日用品', '其他'].forEach(category => categories.add(category))
    return Array.from(categories).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const filteredProducts = computed(() =>
    products.value.filter(product => {
      const matchesCategory = filters.category === 'all' || product.category === filters.category
      const matchesStatus = filters.status === 'all' || product.status === filters.status
      return matchesCategory && matchesStatus && matchesSearch(product, filters.search)
    })
  )

  function updateFilters(nextFilters: Partial<ProfitProductFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadProducts() {
    loading.value = true
    error.value = null
    try {
      const response = await request<ProfitProductsResponse>('/profit/products', {
        query: {
          includeArchived: 'true',
          limit: '200'
        }
      })
      products.value = response.rows
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveProduct(payload: ProfitProductPayload) {
    saving.value = true
    try {
      const response = await request<ProfitProductMutationResponse, ProfitProductPayload>('/profit/products', {
        method: payload.id || payload.productGlobalId ? 'PUT' : 'POST',
        body: payload
      })
      await loadProducts()
      return response.product
    } finally {
      saving.value = false
    }
  }

  async function updateProductStatus(productGlobalId: string, status: ProfitProduct['status']) {
    saving.value = true
    try {
      const response = await request<ProfitProductMutationResponse>('/profit/products', {
        method: 'PATCH',
        body: { productGlobalId, status }
      })
      await loadProducts()
      return response.product
    } finally {
      saving.value = false
    }
  }

  return {
    products,
    filters,
    loading,
    saving,
    error,
    filteredProducts,
    categoryOptions,
    updateFilters,
    loadProducts,
    saveProduct,
    updateProductStatus
  }
}
