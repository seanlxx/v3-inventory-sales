export type PurchaseOrderStatus = 'active' | 'voided'

export type PurchaseItem = {
  id?: string
  productId: string
  productName?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  sellPrice?: number
  category?: string
  machineId?: string
}

export type PurchaseOrder = {
  id: string
  machineId: string
  date: string
  source?: string
  note?: string
  imageAssetId?: string | null
  hasImage?: boolean
  status: PurchaseOrderStatus
  voidedAt?: string | null
  items: PurchaseItem[]
  quantity: number
  totalCost: number
  createdAt: string
  updatedAt?: string
}

export type PurchaseListFilters = {
  month: string
  status: 'active' | 'voided' | 'all'
  search: string
}

export type PurchaseOrderPayload = Record<string, unknown> & {
  id?: string
  machineId?: string
  date: string
  source?: string
  note?: string
  imageBase64?: string
  mimeType?: string
  items: PurchaseItem[]
}

export type PurchaseAiCandidate = {
  id: string
  rawName: string
  productId: string
  productName: string
  confidence: 'high' | 'medium' | 'low'
  quantity: number
  unitPrice: number
  totalPrice: number
  sellPrice?: number
  category?: string
  machineId?: string
  isNewProduct?: boolean
  issue?: string
}

export type PurchaseAiMetadata = {
  date?: string
  source?: string
  note?: string
}
