import type { InventoryBalance } from '~/types/inventory'

export type DashboardKpis = {
  todayRevenue: number
  monthRevenue: number
  monthReceived: number
  monthCogs: number
  monthGrossProfit: number
  profitRate: number
  purchaseCost: number
  refunds: number
  lowStockCount: number
}

export type SalesTrendPoint = {
  date: string
  gross: number
  received: number
  cogs: number
  profit: number
}

export type SalesTrendMachineSeries = {
  machineId: string
  points: readonly SalesTrendPoint[]
}

export type MachineRankingItem = {
  machineId: string
  revenue: number
  profit: number
  quantity: number
}

export type ProfitBreakdownItem = MachineRankingItem

export type DashboardExceptionType = 'refund' | 'loss' | 'void' | 'low_stock'

export type DashboardException = {
  id: string
  type: DashboardExceptionType
  title: string
  occurredAt: string
  refType?: string
  refId?: string
}

export type DashboardReport = {
  month: string
  kpis: DashboardKpis
  salesTrend: SalesTrendPoint[]
  salesTrendByMachine: SalesTrendMachineSeries[]
  machineRanking: MachineRankingItem[]
  profitBreakdown: ProfitBreakdownItem[]
  lowStock: InventoryBalance[]
  recentExceptions: DashboardException[]
}

export type DashboardFilters = {
  month: string
  days: number
  machineId: string
}
