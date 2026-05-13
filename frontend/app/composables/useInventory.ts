import type { ApiError } from '~/types/api'
import type {
  InventoryAdjustmentPayload,
  InventoryBalance,
  InventoryListFilters,
  StockMovement
} from '~/types/inventory'
import type { Product } from '~/types/product'

const defaultFilters: InventoryListFilters = {
  search: '',
  machineId: 'all',
  category: 'all',
  lowStock: false
}

function matchesSearch(balance: InventoryBalance, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return `${balance.productName} ${balance.productId} ${balance.machineId} ${balance.category || ''}`.toLowerCase().includes(keyword)
}

export function useInventory() {
  const { request } = useApi()
  const toastStore = useToastStore()

  const balances = shallowRef<InventoryBalance[]>([])
  const movements = shallowRef<StockMovement[]>([])
  const filters = reactive<InventoryListFilters>({ ...defaultFilters })
  const selectedBalance = shallowRef<InventoryBalance | null>(null)
  const loading = shallowRef(false)
  const movementsLoading = shallowRef(false)
  const adjusting = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)
  const movementsError = shallowRef<ApiError | null>(null)

  const machineOptions = computed(() => {
    const machines = new Set(balances.value.map(balance => balance.machineId).filter(Boolean))
    if (machines.size === 0) {
      machines.add('1号机')
      machines.add('2号机')
    }
    return Array.from(machines).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const categoryOptions = computed(() => {
    const categories = new Set(balances.value.map(balance => balance.category || '其他'))
    ;['饮料', '零食', '日用品', '其他'].forEach(category => categories.add(category))
    return Array.from(categories).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const filteredBalances = computed(() =>
    balances.value.filter(balance => {
      const matchesMachine = filters.machineId === 'all' || balance.machineId === filters.machineId
      const matchesCategory = filters.category === 'all' || (balance.category || '其他') === filters.category
      const matchesLowStock = !filters.lowStock || !!balance.isLowStock
      return matchesMachine && matchesCategory && matchesLowStock && matchesSearch(balance, filters.search)
    })
  )

  function updateFilters(nextFilters: Partial<InventoryListFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadBalances() {
    loading.value = true
    error.value = null
    try {
      balances.value = await request<InventoryBalance[]>('/inventory/balances')
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function loadMovements(balance?: InventoryBalance | null) {
    if (balance !== undefined) selectedBalance.value = balance
    movements.value = []
    movementsLoading.value = true
    movementsError.value = null
    try {
      movements.value = await request<StockMovement[]>('/inventory/movements', {
        query: {
          productId: selectedBalance.value?.productId,
          machineId: selectedBalance.value?.machineId,
          limit: 80
        }
      })
    } catch (caught) {
      movementsError.value = normalizeApiError(caught)
    } finally {
      movementsLoading.value = false
    }
  }

  async function createAdjustment(payload: InventoryAdjustmentPayload) {
    adjusting.value = true
    error.value = null
    try {
      const saved = await request<Product, InventoryAdjustmentPayload>('/inventory/adjustments', {
        method: 'POST',
        body: payload
      })
      toastStore.show('盘点调整已提交', 'success')
      await loadBalances()
      if (selectedBalance.value?.productId === payload.productId) {
        await loadMovements(selectedBalance.value)
      }
      return saved
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      adjusting.value = false
    }
  }

  return {
    balances,
    filteredBalances,
    filters,
    machineOptions,
    categoryOptions,
    selectedBalance,
    movements,
    loading,
    movementsLoading,
    adjusting,
    error,
    movementsError,
    updateFilters,
    loadBalances,
    loadMovements,
    createAdjustment
  }
}
