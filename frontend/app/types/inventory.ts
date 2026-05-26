export type StockMovementType = 'purchase' | 'sale' | 'refund' | 'loss' | 'adjustment' | 'void'

export type InventoryBalance = {
  productId: string
  productName: string
  machineId: string
  stockMachineId?: string
  category?: string
  quantityOnHand: number
  avgCost: number
  purchaseAvgCost?: number
  inventoryValue: number
  lowStockThreshold?: number
  isLowStock?: boolean
  updatedAt?: string
}

export type InventoryListFilters = {
  search: string
  machineId: string
  category: string
  lowStock: boolean
}

export type StockMovement = {
  id: string
  productId: string
  productName?: string
  machineId: string
  movementType: StockMovementType
  qtyDelta: number
  unitCost?: number
  refType: string
  refId: string
  refItemId?: string | null
  voidsMovementId?: string | null
  externalId?: string | null
  reason?: string
  createdAt: string
}

export type InventoryAdjustmentPayload = Record<string, unknown> & {
  productId: string
  machineId?: string
  quantityOnHand: number
  unitCost?: number
  note?: string
}
