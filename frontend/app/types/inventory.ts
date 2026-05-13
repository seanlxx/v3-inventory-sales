export type StockMovementType = 'purchase' | 'sale' | 'refund' | 'loss' | 'adjustment' | 'void'

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
  createdAt: string
}
