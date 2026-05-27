import type { ApiError } from '~/types/api'
import type {
  CycleCountPayload,
  CycleCountResult,
  InventoryAdjustmentPayload,
  InventoryBalance,
  InventoryListFilters,
  InventoryTransferPayload,
  InventoryTransferResult,
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
  return `${balance.productName} ${balance.productId} ${balance.category || ''}`.toLowerCase().includes(keyword)
}

function latestUpdatedAt(left?: string, right?: string) {
  if (!left) return right
  if (!right) return left
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right
}

function groupBalancesByProduct(rows: readonly InventoryBalance[]) {
  const grouped = new Map<string, InventoryBalance>()

  for (const row of rows) {
    const existing = grouped.get(row.productId)
    const quantity = Number(row.quantityOnHand) || 0
    const value = Number(row.inventoryValue) || 0
    const purchaseAvgCost = Number(row.purchaseAvgCost) || Number(existing?.purchaseAvgCost) || 0
    const lowStockThreshold = Number(row.lowStockThreshold ?? existing?.lowStockThreshold ?? 5) || 5

    if (!existing) {
      grouped.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
        machineId: '总库存',
        category: row.category || '其他',
        quantityOnHand: quantity,
        avgCost: quantity > 0 ? value / quantity : 0,
        purchaseAvgCost,
        inventoryValue: value,
        lowStockThreshold,
        isLowStock: quantity <= lowStockThreshold,
        updatedAt: row.updatedAt
      })
      continue
    }

    const nextQuantity = Number(existing.quantityOnHand || 0) + quantity
    const nextValue = Number(existing.inventoryValue || 0) + value
    existing.quantityOnHand = nextQuantity
    existing.inventoryValue = nextValue
    existing.avgCost = nextQuantity > 0 ? nextValue / nextQuantity : 0
    existing.purchaseAvgCost = Number(existing.purchaseAvgCost) || purchaseAvgCost
    existing.lowStockThreshold = lowStockThreshold
    existing.isLowStock = nextQuantity <= lowStockThreshold
    existing.updatedAt = latestUpdatedAt(existing.updatedAt, row.updatedAt)
  }

  return Array.from(grouped.values())
    .sort((left, right) =>
      (left.category || '其他').localeCompare(right.category || '其他', 'zh-CN')
      || left.productName.localeCompare(right.productName, 'zh-CN')
    )
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
  const transferring = shallowRef(false)
  const cycleCounting = shallowRef(false)
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

  const totalBalances = computed(() => groupBalancesByProduct(balances.value))

  const categoryOptions = computed(() => {
    const categories = new Set(totalBalances.value.map(balance => balance.category || '其他'))
    ;['饮料', '零食', '日用品', '其他'].forEach(category => categories.add(category))
    return Array.from(categories).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  })

  const filteredBalances = computed(() =>
    totalBalances.value.filter(balance => {
      const matchesCategory = filters.category === 'all' || (balance.category || '其他') === filters.category
      const matchesLowStock = !filters.lowStock || !!balance.isLowStock
      return matchesCategory && matchesLowStock && matchesSearch(balance, filters.search)
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
      const query: Record<string, string | number | boolean | null | undefined> = {
        productId: selectedBalance.value?.productId,
        limit: 80
      }
      if (selectedBalance.value?.stockMachineId) {
        query.machineId = selectedBalance.value.stockMachineId
      }
      movements.value = await request<StockMovement[]>('/inventory/movements', {
        query
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

  async function createTransfer(payload: InventoryTransferPayload) {
    transferring.value = true
    error.value = null
    try {
      const saved = await request<InventoryTransferResult, InventoryTransferPayload>('/inventory/transfer', {
        method: 'POST',
        body: payload
      })
      toastStore.show('机间调拨已提交', 'success')
      await loadBalances()
      if (selectedBalance.value?.productId === payload.productId) {
        await loadMovements(selectedBalance.value)
      }
      return saved
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      transferring.value = false
    }
  }

  async function createCycleCount(payload: CycleCountPayload) {
    cycleCounting.value = true
    error.value = null
    try {
      const saved = await request<CycleCountResult, CycleCountPayload>('/inventory/cycle-count', {
        method: 'POST',
        body: payload
      })
      toastStore.show(saved.changedCount > 0 ? `盘点已提交，调整 ${saved.changedCount} 项` : '盘点已提交，无库存差异', 'success')
      await loadBalances()
      if (selectedBalance.value && payload.items.some(item => item.productId === selectedBalance.value?.productId)) {
        await loadMovements(selectedBalance.value)
      }
      return saved
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      cycleCounting.value = false
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
    transferring,
    cycleCounting,
    error,
    movementsError,
    updateFilters,
    loadBalances,
    loadMovements,
    createAdjustment,
    createTransfer,
    createCycleCount
  }
}
