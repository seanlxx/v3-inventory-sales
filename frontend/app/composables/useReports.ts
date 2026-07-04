import type { ApiError } from '~/types/api'
import type { InventoryBalance } from '~/types/inventory'
import type { ProfitCostGap, ProfitProductMerge, ProfitSummary } from '~/types/profit'
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
      const summary = await request<ProfitSummary>('/profit/summary', {
        query: {
          month: filters.month,
          days: filters.days,
          machineId: filters.machineId === 'all' ? undefined : filters.machineId
        }
      })
      report.value = mapProfitSummary(summary)
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

function mapProfitSummary(summary: ProfitSummary): DashboardReport {
  const today = new Date().toISOString().slice(0, 10)
  const todayPoint = summary.dailyTrend.find(point => point.date === today)
  const salesTrend = summary.dailyTrend.map(point => ({
    date: point.date,
    gross: point.grossSales,
    received: point.netRevenue,
    cogs: point.cogs,
    profit: point.grossProfit
  }))
  const machineRanking = summary.machineRanking.map(item => ({
    machineId: item.machineId,
    revenue: item.netRevenue,
    profit: item.grossProfit,
    quantity: Number(item.quantity ?? item.orderCount) || 0
  }))

  return {
    month: summary.month,
    kpis: {
      todayRevenue: todayPoint?.netRevenue ?? 0,
      monthRevenue: summary.kpis.netRevenue,
      monthReceived: summary.kpis.netRevenue,
      monthCogs: summary.kpis.cogs,
      monthGrossProfit: summary.kpis.grossProfit,
      profitRate: summary.kpis.profitRate,
      purchaseCost: summary.kpis.purchaseCost,
      refunds: summary.kpis.refunds,
      lowStockCount: summary.kpis.missingCostProductCount
    },
    salesTrend,
    salesTrendByMachine: [],
    machineRanking,
    profitBreakdown: machineRanking,
    lowStock: summary.costGaps.map(mapCostGap),
    recentExceptions: summary.productMerges.map(mapProductMerge)
  }
}

function mapCostGap(item: ProfitCostGap): InventoryBalance {
  return {
    productId: item.productGlobalId,
    productName: item.productName,
    machineId: '全局商品',
    category: '成本缺口',
    quantityOnHand: item.quantity,
    avgCost: 0,
    inventoryValue: item.salesAmount,
    lowStockThreshold: 0,
    isLowStock: true
  }
}

function mapProductMerge(item: ProfitProductMerge) {
  return {
    id: `product-merge:${item.productGlobalId}`,
    type: 'product_merge' as const,
    title: `${item.productName} · 合并 ${item.legacyProductCount} 个旧商品`,
    occurredAt: new Date().toISOString(),
    refType: 'products_global',
    refId: item.productGlobalId
  }
}
