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
  aliases: ProfitProductAlias[]
}

export type ProfitProductAlias = {
  id: string
  aliasName: string
  normalizedAlias: string
  source: string
  sourceProductId?: string | null
  sourceExternalId?: string | null
  sourceMachineId?: string | null
  status: 'active' | 'archived'
}

export type ProfitProductsResponse = {
  rows: ProfitProduct[]
}

export type ProfitProductPayload = {
  id?: string
  productGlobalId?: string
  productName: string
  category: string
  defaultSellPrice: number
  status: 'active' | 'archived'
}

export type ProfitProductMutationResponse = {
  product: ProfitProduct
}

export type ProfitProductFilters = {
  search: string
  category: string
  status: 'active' | 'archived' | 'all'
}

export type ProfitRecordStatus = 'active' | 'voided' | 'all'

export type ProfitPurchaseItem = {
  id: string
  productGlobalId: string
  productName: string
  quantity: number
  unitCost: number
  totalCost: number
}

export type ProfitPurchaseRecord = {
  id: string
  legacyPurchaseId?: string | null
  recordDate: string
  source: string
  status: Exclude<ProfitRecordStatus, 'all'>
  voidedAt?: string | null
  note: string
  quantity: number
  totalCost: number
  itemCount: number
  items: ProfitPurchaseItem[]
}

export type ProfitPurchasesResponse = {
  rows: ProfitPurchaseRecord[]
}

export type ProfitPurchasePayload = {
  id?: string
  recordDate: string
  source?: string
  note?: string
  items: Array<{
    productGlobalId: string
    quantity: number
    unitCost: number
    totalCost?: number
  }>
}

export type ProfitPurchaseMutationResponse = {
  record: ProfitPurchaseRecord
}

export type ProfitPurchaseFilters = {
  month: string
  status: ProfitRecordStatus
  search: string
}

export type ProfitSalesRecordType = 'sale' | 'refund' | 'loss' | 'all'

export type ProfitSalesItem = {
  id: string
  productGlobalId: string
  productName: string
  quantity: number
  unitPrice: number
  lineAmount: number
  unitCost: number
  lineCogs: number
}

export type ProfitSalesRecord = {
  id: string
  legacySalesId?: string | null
  type: Exclude<ProfitSalesRecordType, 'all'>
  machineId: string
  recordDate: string
  yearMonth: string
  source: string
  externalId?: string | null
  status: Exclude<ProfitRecordStatus, 'all'>
  voidedAt?: string | null
  note: string
  grossAmount: number
  refundAmount: number
  platformFee: number
  serviceFee: number
  fees: number
  discount: number
  netRevenue: number
  totalCogs: number
  signedCogs: number
  grossProfit: number
  quantity: number
  itemCount: number
  items: ProfitSalesItem[]
}

export type ProfitSalesResponse = {
  rows: ProfitSalesRecord[]
}

export type ProfitSalesPayload = {
  id?: string
  type: Exclude<ProfitSalesRecordType, 'all'>
  machineId: string
  recordDate: string
  source?: string
  externalId?: string
  note?: string
  platformFee?: number
  serviceFee?: number
  discount?: number
  refundAmount?: number
  items: Array<{
    productGlobalId: string
    quantity: number
    unitPrice: number
    lineAmount?: number
    unitCost?: number
    lineCogs?: number
  }>
}

export type ProfitSalesMutationResponse = {
  record: ProfitSalesRecord
}

export type ProfitSalesFilters = {
  month: string
  type: ProfitSalesRecordType
  status: ProfitRecordStatus
  machineId: string
  search: string
}
