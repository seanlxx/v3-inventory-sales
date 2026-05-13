export type SalesOrderType = 'sale' | 'refund' | 'loss'
export type SalesOrderStatus = 'active' | 'voided'

export type SalesItem = {
  id?: string
  productId: string
  productName?: string
  quantity: number
  sellPrice: number
  itemRevenue?: number
  itemCogs?: number
  actualDeducted?: number
}

export type SalesOrder = {
  id: string
  machineId: string
  date: string
  yearMonth?: string
  totalAmount: number
  totalCogs?: number
  items: SalesItem[]
  type: SalesOrderType
  note?: string
  hasImage?: boolean
  status: SalesOrderStatus
  voidedAt?: string | null
  createdAt: string
}

export type SalesListFilters = {
  month: string
  type: SalesOrderType | 'all'
  status: SalesOrderStatus | 'all'
  machineId: string
  search: string
}

export type SalesOrderPayload = Record<string, unknown> & {
  id?: string
  machineId?: string
  date: string
  note?: string
  imageBase64?: string
  mimeType?: string
  items: SalesItem[]
}

export type SalesAiCandidate = {
  id: string
  rawName: string
  productId: string
  productName: string
  confidence: 'high' | 'medium' | 'low'
  quantity: number
  sellPrice: number
  itemRevenue: number
  issue?: string
}
