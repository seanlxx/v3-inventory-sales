export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'refund'
  | 'loss'
  | 'adjustment'
  | 'void'
  | 'transfer_out'
  | 'transfer_in'

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

export type CycleCountItemPayload = {
  productId: string
  observedQty: number
}

export type CycleCountPayload = {
  machineId: string
  reason: string
  items: CycleCountItemPayload[]
}

export type CycleCountResultItem = {
  productId: string
  productName: string
  previousQty: number
  observedQty: number
  qtyDelta: number
  unitCost: number
}

export type CycleCountResult = {
  id: string
  machineId: string
  changedCount: number
  items: CycleCountResultItem[]
  reason: string
  createdAt: string
}
