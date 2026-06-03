import type { ApiError } from '~/types/api'
import type { DashboardFilters, DashboardReport } from '~/types/report'
import { machineOptionsWithDefaults } from '~/utils/machines'

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function useReports() {
  const { request } = useApi()

  const report = shallowRef<DashboardReport | null>(null)
  const filters = reactive<DashboardFilters>({
    month: currentMonth(),
    days: 7,
    machineId: 'all'
  })
  const loading = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  const machineOptions = computed(() => {
    return machineOptionsWithDefaults([
      ...(report.value?.machineRanking.map(item => item.machineId) ?? []),
      ...(report.value?.salesTrendByMachine?.map(series => series.machineId) ?? []),
      ...(report.value?.lowStock.map(item => item.machineId) ?? [])
    ])
  })

  function updateFilters(nextFilters: Partial<DashboardFilters>) {
    Object.assign(filters, nextFilters)
  }

  async function loadDashboard() {
    loading.value = true
    error.value = null
    try {
      report.value = await request<DashboardReport>('/reports/dashboard', {
        query: {
          month: filters.month,
          days: filters.days,
          machineId: filters.machineId === 'all' ? undefined : filters.machineId
        }
      })
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  return {
    report,
    filters,
    machineOptions,
    loading,
    error,
    updateFilters,
    loadDashboard
  }
}
