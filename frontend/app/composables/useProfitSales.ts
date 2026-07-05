import type { ApiError } from '~/types/api'
import type {
  ProfitSalesFilters,
  ProfitSalesRecord,
  ProfitSalesResponse
} from '~/types/profit'
import { machineOptionsWithDefaults } from '~/utils/machines'

const defaultFilters: ProfitSalesFilters = {
  month: new Date().toISOString().slice(0, 7),
  type: 'all',
  status: 'active',
  machineId: 'all',
  search: ''
}

export function useProfitSales() {
  const { request } = useApi()

  const records = shallowRef<ProfitSalesRecord[]>([])
  const filters = reactive<ProfitSalesFilters>({ ...defaultFilters })
  const loading = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  const summary = computed(() =>
    records.value.reduce((result, record) => {
      if (record.status === 'voided') return result
      result.count += 1
      result.quantity += Number(record.quantity) || 0
      result.netRevenue += Number(record.netRevenue) || 0
      result.grossProfit += Number(record.grossProfit) || 0
      result.fees += Number(record.fees) || 0
      result.cogs += Number(record.signedCogs) || 0
      if (record.type === 'sale') result.salesAmount += Number(record.grossAmount) || 0
      if (record.type === 'refund') result.refundAmount += Number(record.refundAmount) || 0
      return result
    }, {
      count: 0,
      quantity: 0,
      salesAmount: 0,
      refundAmount: 0,
      netRevenue: 0,
      cogs: 0,
      fees: 0,
      grossProfit: 0
    })
  )

  const machineOptions = computed(() =>
    machineOptionsWithDefaults(records.value.map(record => record.machineId))
  )

  function updateFilters(nextFilters: Partial<ProfitSalesFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadRecords() {
    loading.value = true
    error.value = null
    try {
      const response = await request<ProfitSalesResponse>('/profit/sales', {
        query: {
          month: filters.month,
          type: filters.type,
          status: filters.status,
          machineId: filters.machineId,
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
    machineOptions,
    loading,
    error,
    updateFilters,
    loadRecords
  }
}
