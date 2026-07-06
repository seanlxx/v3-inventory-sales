export type DashboardKpis = {
  todayRevenue: number
  monthRevenue: number
  monthReceived: number
  monthCogs: number
  monthGrossProfit: number
  profitRate: number
  purchaseCost: number
  refunds: number
  costGapCount: number
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

export type ProductRankingItem = {
  productGlobalId: string
  productName: string
  quantity: number
  salesAmount: number
  netRevenue: number
  cogs: number
  profit: number
  profitRate: number
}

export type DashboardExceptionType = 'refund' | 'loss' | 'void' | 'cost_gap' | 'product_merge'

export type DashboardException = {
  id: string
  type: DashboardExceptionType
  title: string
  occurredAt: string
  refType?: string
  refId?: string
}

export type DashboardCostGapItem = {
  productGlobalId: string
  productName: string
  category: string
  quantity: number
  salesAmount: number
}

export type DashboardReport = {
  month: string
  kpis: DashboardKpis
  salesTrend: SalesTrendPoint[]
  salesTrendByMachine: SalesTrendMachineSeries[]
  machineRanking: MachineRankingItem[]
  profitBreakdown: ProfitBreakdownItem[]
  productRanking: ProductRankingItem[]
  costGaps: DashboardCostGapItem[]
  recentExceptions: DashboardException[]
}

export type DashboardFilters = {
  month: string
  days: number
  machineId: string
}
