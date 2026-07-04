export type ProfitKpis = {
  grossSales: number
  refunds: number
  fees: number
  discounts: number
  netRevenue: number
  cogs: number
  grossProfit: number
  profitRate: number
  purchaseCost: number
  orderCount: number
  quantity: number
  missingCostProductCount: number
  mergedProductCount: number
}

export type ProfitTrendPoint = {
  date: string
  grossSales: number
  refunds: number
  netRevenue: number
  cogs: number
  grossProfit: number
  orderCount: number
}

export type ProfitMachineRankingItem = {
  machineId: string
  netRevenue: number
  cogs: number
  grossProfit: number
  profitRate: number
  orderCount: number
  quantity?: number
}

export type ProfitProductRankingItem = {
  productGlobalId: string
  productName: string
  quantity: number
  salesAmount: number
  cogs: number
  grossProfit: number
  profitRate: number
}

export type ProfitCostGap = {
  productGlobalId: string
  productName: string
  quantity: number
  salesAmount: number
  cogs: number
  costSnapshotCount: number
}

export type ProfitProductMerge = {
  productGlobalId: string
  productName: string
  normalizedName: string
  legacyProductCount: number
  sourceProductIds: string[]
  aliases: string[]
}

export type ProfitSummary = {
  month: string
  machineId: string
  kpis: ProfitKpis
  dailyTrend: ProfitTrendPoint[]
  machineRanking: ProfitMachineRankingItem[]
  productRanking: ProfitProductRankingItem[]
  costGaps: ProfitCostGap[]
  productMerges: ProfitProductMerge[]
}

export type ProfitProduct = {
  productGlobalId: string
  productName: string
  normalizedName: string
  category: string
  defaultSellPrice: number
  status: 'active' | 'archived'
  legacyProductCount: number
  aliasCount: number
  purchaseQuantity: number
  purchaseCost: number
  saleQuantity: number
  salesAmount: number
  cogs: number
  grossProfit: number
  lastCost: number
  lastCostAt?: string | null
}

export type ProfitProductsResponse = {
  rows: ProfitProduct[]
}

export type ProfitProductFilters = {
  search: string
  category: string
  status: 'active' | 'archived' | 'all'
}
