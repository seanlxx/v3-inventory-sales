export type OrderImportItem = {
  barcode: string
  productName: string
  unitPrice: number
  quantity: number
}

export type OrderImportOrder = {
  orderNo: string
  status: string
  deviceCode: string
  deviceName: string
  recordDate: string
  salesAmount: number
  platformFee: number
  serviceFee: number
  discount: number
  refundAmount: number
  items: OrderImportItem[]
}

export type OrderImportFileSummary = {
  fileName: string
  sheetName: string
  totalOrders: number
  completedOrders: number
  skippedOrders: number
  itemRows: number
  startDate: string
  endDate: string
}

export type OrderImportSummary = {
  dryRun: boolean
  ordersReceived: number
  ordersReady: number
  ordersImported: number
  ordersDuplicate: number
  ordersSkipped: number
  itemsReady: number
  itemsImported: number
  productsCreated: number
  productsMatched: number
  aliasesCreated: number
  missingCostItems: number
  warnings: number
}

export type OrderImportResponse = {
  summary: OrderImportSummary
  warnings: string[]
}

export type OrderImportPayload = {
  dryRun: boolean
  orders: OrderImportOrder[]
}