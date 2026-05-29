export type ProductStatus = 'active' | 'archived'

export type Product = {
  id: string
  name: string
  machineId: string
  stockMachineId?: string
  category: string
  sellPrice: number
  status: ProductStatus
  imageAssetId?: string | null
  currentStock?: number
  inventoryByMachine?: Record<string, number>
  avgCost?: number
  manualCost?: number
  purchaseAvgCost?: number
  totalPurchaseQty?: number
  totalPurchaseCost?: number
  salesTrend?: number[]
  createdAt: string
  updatedAt?: string
}

export type ProductListFilters = {
  search: string
  machineId: string
  category: string
  status: 'active' | 'archived' | 'all'
}

export type ProductStatusPayload = Record<string, unknown> & {
  id: string
  status: ProductStatus
}

export type ProductMutationPayload = Record<string, unknown> & {
  id?: string
  name: string
  machineId: string
  category?: string
  sellPrice: number
  manualCost?: number
  imageAssetId?: string | null
}
