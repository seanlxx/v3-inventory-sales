import type {
  OrderImportFileSummary,
  OrderImportOrder,
  OrderImportPayload,
  OrderImportResponse,
  OrderImportSummary
} from '~/types/orderImport'

type ExcelCell = string | number | boolean | Date | null | undefined
type ExcelRow = ExcelCell[]

const REQUIRED_COLUMNS = [
  '订单号',
  '优惠金额(元)',
  '销售额(元)',
  '算法服务费',
  '手续费(元)',
  '退款金额(元)',
  '状态',
  '设备编号',
  '设备名称',
  '创建时间',
  '商品条码',
  '商品名称',
  '商品单价',
  '商品数量'
] as const

function cellText(value: ExcelCell): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatCellDate(value)
  return String(value).trim()
}

function cellNumber(value: ExcelCell): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = cellText(value).replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCellDate(value: ExcelCell): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const match = cellText(value).match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/)
  const [, year, month, day] = match || []
  if (!year || !month || !day) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function headerIndexes(header: ExcelRow): Map<string, number> {
  const indexes = new Map<string, number>()
  header.forEach((cell, index) => {
    const label = cellText(cell)
    if (label && !indexes.has(label)) indexes.set(label, index)
  })
  const missing = REQUIRED_COLUMNS.filter(column => !indexes.has(column))
  if (missing.length > 0) {
    throw new Error(`Excel 缺少列：${missing.join('、')}`)
  }
  return indexes
}

function valueAt(row: ExcelRow, indexes: Map<string, number>, column: string): ExcelCell {
  const index = indexes.get(column)
  return index === undefined ? undefined : row[index]
}

function parseOrders(rows: ExcelRow[]): OrderImportOrder[] {
  if (rows.length < 2) throw new Error('Excel 中没有订单数据')
  const indexes = headerIndexes(rows[0] || [])
  const orders: OrderImportOrder[] = []
  const orderByNumber = new Map<string, OrderImportOrder>()
  let currentOrder: OrderImportOrder | null = null

  for (const row of rows.slice(1)) {
    const orderNo = cellText(valueAt(row, indexes, '订单号'))
    if (orderNo) {
      currentOrder = orderByNumber.get(orderNo) || null
      if (!currentOrder) {
        currentOrder = {
          orderNo,
          status: cellText(valueAt(row, indexes, '状态')),
          deviceCode: cellText(valueAt(row, indexes, '设备编号')),
          deviceName: cellText(valueAt(row, indexes, '设备名称')),
          recordDate: formatCellDate(valueAt(row, indexes, '创建时间')),
          salesAmount: cellNumber(valueAt(row, indexes, '销售额(元)')),
          platformFee: cellNumber(valueAt(row, indexes, '手续费(元)')),
          serviceFee: cellNumber(valueAt(row, indexes, '算法服务费')),
          discount: cellNumber(valueAt(row, indexes, '优惠金额(元)')),
          refundAmount: cellNumber(valueAt(row, indexes, '退款金额(元)')),
          items: []
        }
        orderByNumber.set(orderNo, currentOrder)
        orders.push(currentOrder)
      }
    }

    if (!currentOrder) continue
    const productName = cellText(valueAt(row, indexes, '商品名称'))
    const quantity = Math.round(cellNumber(valueAt(row, indexes, '商品数量')))
    if (!productName || quantity <= 0) continue
    currentOrder.items.push({
      barcode: cellText(valueAt(row, indexes, '商品条码')),
      productName,
      unitPrice: cellNumber(valueAt(row, indexes, '商品单价')),
      quantity
    })
  }

  if (orders.length === 0) throw new Error('Excel 中没有识别到订单号')
  return orders
}

function summarizeFile(file: File, sheetName: string, orders: OrderImportOrder[]): OrderImportFileSummary {
  const dates = orders.map(order => order.recordDate).filter(Boolean).sort()
  const completedOrders = orders.filter(order => (
    order.status === '已完成'
    && order.refundAmount <= 0
    && order.items.length > 0
  )).length
  return {
    fileName: file.name,
    sheetName,
    totalOrders: orders.length,
    completedOrders,
    skippedOrders: orders.length - completedOrders,
    itemRows: orders.reduce((sum, order) => sum + order.items.length, 0),
    startDate: dates[0] || '',
    endDate: dates.at(-1) || ''
  }
}

export function useOrderImport() {
  const { request } = useApi()
  const toast = useToastStore()
  const orders = shallowRef<OrderImportOrder[]>([])
  const fileSummary = shallowRef<OrderImportFileSummary | null>(null)
  const previewSummary = shallowRef<OrderImportSummary | null>(null)
  const result = shallowRef<OrderImportResponse | null>(null)
  const warnings = shallowRef<string[]>([])
  const parsing = shallowRef(false)
  const previewing = shallowRef(false)
  const importing = shallowRef(false)
  const error = shallowRef('')

  function clearSelection() {
    orders.value = []
    fileSummary.value = null
    previewSummary.value = null
    result.value = null
    warnings.value = []
    error.value = ''
  }

  async function requestPreview(nextOrders: OrderImportOrder[]) {
    previewing.value = true
    try {
      const response = await request<OrderImportResponse, OrderImportPayload>('/profit/sales-import', {
        method: 'POST',
        body: { dryRun: true, orders: nextOrders }
      })
      previewSummary.value = response.summary
      warnings.value = response.warnings
    } finally {
      previewing.value = false
    }
  }

  async function selectFile(file: File) {
    clearSelection()
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      error.value = '请选择 .xlsx 格式的订单明细文件'
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      error.value = 'Excel 文件不能超过 10MB'
      return
    }

    parsing.value = true
    try {
      const excel = await import('read-excel-file')
      const sheetNames = await excel.readSheetNames(file)
      if (sheetNames.length === 0) throw new Error('Excel 中没有工作表')
      const sheetName = sheetNames.includes('订单数据') ? '订单数据' : sheetNames[0]!
      const rows = await excel.default(file, { sheet: sheetName }) as ExcelRow[]
      const nextOrders = parseOrders(rows)
      orders.value = nextOrders
      fileSummary.value = summarizeFile(file, sheetName, nextOrders)
      await requestPreview(nextOrders)
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : caught && typeof caught === 'object' && 'message' in caught
          ? String(caught.message)
          : 'Excel 解析失败'
      error.value = message
      toast.show(message, 'danger')
    } finally {
      parsing.value = false
    }
  }

  async function importOrders() {
    if (orders.value.length === 0 || !previewSummary.value?.ordersReady) return
    importing.value = true
    error.value = ''
    try {
      const response = await request<OrderImportResponse, OrderImportPayload>('/profit/sales-import', {
        method: 'POST',
        body: { dryRun: false, orders: orders.value }
      })
      result.value = response
      warnings.value = response.warnings
      toast.show(
        `已补充 ${response.summary.ordersImported} 个新订单，跳过 ${response.summary.ordersDuplicate} 个重复订单`,
        'success'
      )
    } catch (caught) {
      error.value = caught && typeof caught === 'object' && 'message' in caught
        ? String(caught.message)
        : '订单导入失败'
    } finally {
      importing.value = false
    }
  }

  return {
    fileSummary,
    previewSummary,
    result,
    warnings,
    parsing,
    previewing,
    importing,
    error,
    selectFile,
    importOrders,
    clearSelection
  }
}
