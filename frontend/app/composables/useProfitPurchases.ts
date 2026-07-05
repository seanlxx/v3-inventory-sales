import type { ApiError } from '~/types/api'
import type {
  ProfitPurchaseFilters,
  ProfitPurchaseRecord,
  ProfitPurchasesResponse
} from '~/types/profit'

const defaultFilters: ProfitPurchaseFilters = {
  month: new Date().toISOString().slice(0, 7),
  status: 'active',
  search: ''
}

export function useProfitPurchases() {
  const { request } = useApi()

  const records = shallowRef<ProfitPurchaseRecord[]>([])
  const filters = reactive<ProfitPurchaseFilters>({ ...defaultFilters })
  const loading = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  const summary = computed(() =>
    records.value.reduce((result, record) => {
      if (record.status === 'voided') return result
      result.totalCost += Number(record.totalCost) || 0
      result.quantity += Number(record.quantity) || 0
      result.count += 1
      return result
    }, { totalCost: 0, quantity: 0, count: 0 })
  )

  function updateFilters(nextFilters: Partial<ProfitPurchaseFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadRecords() {
    loading.value = true
    error.value = null
    try {
      const response = await request<ProfitPurchasesResponse>('/profit/purchases', {
        query: {
          month: filters.month,
          status: filters.status,
          search: filters.search,
          limit: '200'
        }
      })
      records.value = response.rows
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  return {
    records,
    filters,
    summary,
    loading,
    error,
    updateFilters,
    loadRecords
  }
}
