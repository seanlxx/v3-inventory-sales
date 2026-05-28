export type ZnOrderRow = {
  vendorOrderNo: string
  title: string
  status: string
  deviceCode: string
  vendorProductName: string
  vendorBarcode: string
  unitPrice: number
  quantity: number
  lineAmount: number
  receivedAmount: number
  refundAmount: number
  platformFee: number
  serviceFee: number
  discount: number
  date: string
}

export type ZnSettlementRow = {
  vendorOrderNo: string
  deviceCode: string
  grossAmount: number
  refundAmount: number
  platformFee: number
  serviceFee: number
  expense: number
  payMethod: string
  incomeType: string
  settledAt: string
}

export type ZnRefundRow = {
  refundOrderNo: string
  deviceName: string
  originalOrderNo: string
  paidAmount: number
  refundAmount: number
  purchaseTime: string
  paidAt: string
  transactionNo: string
  vendorProductName: string
  vendorBarcode: string
  quantity: number
  unitPrice: number
  payMethod: string
  orderStatus: string
  refundStatus: string
  refundTime: string
  operator: string
  note: string
}

export function pickZnField(row: Record<string, unknown>, names: string[]): string {
  for (const key of Object.keys(row)) {
    const trimmed = key.trim()
    if (names.some(name => trimmed.startsWith(name))) {
      const value = row[key]
      if (value === null || value === undefined) return ''
      return String(value).trim()
    }
  }
  return ''
}

export function znNumber(value: string): number {
  if (!value) return 0
  const n = Number(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function normalizeZnOrderRow(raw: Record<string, unknown>): ZnOrderRow | null {
  const vendorOrderNo = pickZnField(raw, ['订单号'])
  const title = pickZnField(raw, ['标题'])
  const status = pickZnField(raw, ['状态'])
  const deviceCode = pickZnField(raw, ['设备编号'])
  const vendorProductName = pickZnField(raw, ['商品名称'])
  const vendorBarcode = ''
  const unitPrice = znNumber(pickZnField(raw, ['商品单价']))
  const quantity = Math.max(0, Number(pickZnField(raw, ['商品数量'])) || 0)
  const lineAmount = znNumber(pickZnField(raw, ['销售额', '价格']))
  const receivedAmount = znNumber(pickZnField(raw, ['预估到帐金额', '预估到账金额', '到账金额']))
  const refundAmount = znNumber(pickZnField(raw, ['退款金额']))
  const platformFee = znNumber(pickZnField(raw, ['手续费']))
  const serviceFee = znNumber(pickZnField(raw, ['算法服务费']))
  const discount = znNumber(pickZnField(raw, ['优惠金额']))
  const date = pickZnField(raw, ['创建时间', '扣款时间'])

  if (!vendorOrderNo && !deviceCode && !vendorProductName) return null
  return {
    vendorOrderNo, title, status, deviceCode, vendorProductName, vendorBarcode,
    unitPrice, quantity, lineAmount, receivedAmount, refundAmount,
    platformFee, serviceFee, discount, date
  }
}

export function normalizeZnSettlementRow(raw: Record<string, unknown>): ZnSettlementRow | null {
  const vendorOrderNo = pickZnField(raw, ['订单号'])
  const deviceCode = pickZnField(raw, ['设备号:', '设备编号'])
  const grossAmount = znNumber(pickZnField(raw, ['销售额']))
  const refundAmount = znNumber(pickZnField(raw, ['退款金额']))
  const platformFee = znNumber(pickZnField(raw, ['手续费']))
  const serviceFee = znNumber(pickZnField(raw, ['算法费', '算法服务费']))
  const expense = znNumber(pickZnField(raw, ['费用']))
  const payMethod = pickZnField(raw, ['支付方式'])
  const incomeType = pickZnField(raw, ['收支类型'])
  const settledAt = pickZnField(raw, ['订单扣款时间', '时间:'])

  if (!vendorOrderNo && !deviceCode && grossAmount <= 0 && expense <= 0) return null
  return {
    vendorOrderNo,
    deviceCode,
    grossAmount,
    refundAmount,
    platformFee,
    serviceFee,
    expense,
    payMethod,
    incomeType,
    settledAt
  }
}

export function normalizeZnRefundRow(raw: Record<string, unknown>): ZnRefundRow | null {
  const refundOrderNo = pickZnField(raw, ['退款订单号'])
  const deviceName = pickZnField(raw, ['设备名称', '设备编号'])
  const originalOrderNo = pickZnField(raw, ['订单号'])
  const paidAmount = znNumber(pickZnField(raw, ['订单实付金额']))
  const refundAmount = znNumber(pickZnField(raw, ['退款金额']))
  const purchaseTime = pickZnField(raw, ['购买时间'])
  const paidAt = pickZnField(raw, ['支付时间'])
  const transactionNo = pickZnField(raw, ['交易号'])
  const vendorProductName = pickZnField(raw, ['商品名称'])
  const vendorBarcode = pickZnField(raw, ['商品条码'])
  const quantity = Math.max(0, Number(pickZnField(raw, ['商品数量'])) || 0)
  const unitPrice = znNumber(pickZnField(raw, ['商品单价']))
  const payMethod = pickZnField(raw, ['支付方式'])
  const orderStatus = pickZnField(raw, ['订单状态'])
  const refundStatus = pickZnField(raw, ['退款状态'])
  const refundTime = pickZnField(raw, ['退款时间'])
  const operator = pickZnField(raw, ['退款人'])
  const note = pickZnField(raw, ['退款备注'])

  if (!refundOrderNo && !originalOrderNo && !deviceName && !vendorProductName) return null
  return {
    refundOrderNo,
    deviceName,
    originalOrderNo,
    paidAmount,
    refundAmount,
    purchaseTime,
    paidAt,
    transactionNo,
    vendorProductName,
    vendorBarcode,
    quantity,
    unitPrice,
    payMethod,
    orderStatus,
    refundStatus,
    refundTime,
    operator,
    note
  }
}
