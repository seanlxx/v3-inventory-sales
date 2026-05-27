import type { ApiError } from '~/types/api'
import type { DashboardFilters, DashboardReport } from '~/types/report'

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
    const machines = new Set<string>()
    report.value?.machineRanking.forEach(item => {
      if (item.machineId) machines.add(item.machineId)
    })
    report.value?.salesTrendByMachine?.forEach(series => {
      if (series.machineId) machines.add(series.machineId)
    })
    report.value?.lowStock.forEach(item => {
      if (item.machineId) machines.add(item.machineId)
    })
    return Array.from(machines).sort((left, right) => left.localeCompare(right, 'zh-CN'))
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
