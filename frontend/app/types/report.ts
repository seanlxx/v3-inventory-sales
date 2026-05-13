import type { InventoryBalance } from '~/types/inventory'

export type DashboardKpis = {
  todayRevenue: number
  monthRevenue: number
  monthCogs: number
  monthGrossProfit: number
  profitRate: number
  purchaseCost: number
  refunds: number
  lowStockCount: number
}

export type SalesTrendPoint = {
  date: string
  revenue: number
  quantity: number
}

export type MachineRankingItem = {
  machineId: string
  revenue: number
  profit: number
  quantity: number
}

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
  machineRanking: MachineRankingItem[]
  lowStock: InventoryBalance[]
  recentExceptions: DashboardException[]
}

export type DashboardFilters = {
  month: string
  days: number
  machineId: string
}
