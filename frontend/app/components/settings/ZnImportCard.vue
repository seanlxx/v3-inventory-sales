<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import {
  normalizeZnOrderRow,
  normalizeZnRefundRow,
  normalizeZnSettlementRow,
  type ZnOrderRow,
  type ZnRefundRow,
  type ZnSettlementRow
} from '~/composables/useZnExcel'
import { useToastStore } from '~/stores/toast'

type ImportSummary = {
  ordersImported: number
  ordersDuplicate: number
  ordersSkipped: number
  linesImported: number
  productsCreated: number
  productsExisting?: number
  productsStandardized?: number
  costsMatched?: number
  costsMissing?: number
  ordersReconciled?: number
  warnings: number
}

type ImportResult = {
  summary: ImportSummary
  warnings: string[]
}

type ProductImportSummary = {
  productsParsed: number
  productsCreated: number
  productsExisting: number
  productsStandardized: number
  rowsSkipped: number
  warnings: number
}

type ProductImportResult = {
  summary: ProductImportSummary
  warnings: string[]
}

type SettlementSummary = {
  settlementsProcessed: number
  settlementsUpdated: number
  settlementsSkipped: number
  settlementsMissing: number
  warnings: number
}

type SettlementResult = {
  summary: SettlementSummary
  warnings: string[]
}

type RefundSummary = {
  refundsParsed: number
  refundsImported: number
  refundsDuplicate: number
  refundsSkipped: number
  refundsMissing: number
  linesImported: number
  stockRestored: number
  amountOnly: number
  warnings: number
}

type RefundResult = {
  summary: RefundSummary
  warnings: string[]
}

type ImportMode = 'orders' | 'settlements' | 'refunds'

const api = useApi()
const toast = useToastStore()

const activeMode = ref<ImportMode>('orders')
const fileName = ref('')
const parsing = ref(false)
const submitting = ref(false)
const rows = ref<ZnOrderRow[]>([])
const settlementRows = ref<ZnSettlementRow[]>([])
const refundRows = ref<ZnRefundRow[]>([])
const result = ref<ImportResult | null>(null)
const productResult = ref<ProductImportResult | null>(null)
const settlementResult = ref<SettlementResult | null>(null)
const refundResult = ref<RefundResult | null>(null)
const errorMessage = ref('')
const importProgress = ref('')
const IMPORT_BATCH_SIZE = 80

const summaryCount = computed(() => {
  if (rows.value.length === 0) return null
  const devices = new Set<string>()
  let completed = 0
  let canceled = 0
  let refunded = 0
  let importableRows = 0
  const importableOrders = new Set<string>()
  const importableProducts = new Set<string>()
  let lastOrderNo = ''
  for (const row of rows.value) {
    devices.add(row.deviceCode)
    if (row.status === '已完成') completed += 1
    else canceled += 1
    if (row.refundAmount > 0) refunded += 1
    if (isImportableRow(row)) {
      importableRows += 1
      const orderNo = row.vendorOrderNo || lastOrderNo
      if (orderNo) importableOrders.add(orderNo)
      importableProducts.add(productKey(row))
    }
    if (row.vendorOrderNo) lastOrderNo = row.vendorOrderNo
  }
  return {
    total: rows.value.length,
    devices: Array.from(devices),
    completed,
    canceled,
    refunded,
    importableRows,
    importableOrders: importableOrders.size,
    importableProducts: importableProducts.size
  }
})

const settlementSummaryCount = computed(() => {
  if (settlementRows.value.length === 0) return null
  const devices = new Set<string>()
  const orders = new Set<string>()
  let incomeRows = 0
  let expenseRows = 0
  for (const row of settlementRows.value) {
    if (row.deviceCode) devices.add(row.deviceCode)
    if (row.vendorOrderNo) orders.add(row.vendorOrderNo)
    if (row.incomeType === '收入' || !row.incomeType) incomeRows += 1
    else expenseRows += 1
  }
  return {
    total: settlementRows.value.length,
    devices: Array.from(devices),
    orders: orders.size,
    incomeRows,
    expenseRows
  }
})

const refundSummaryCount = computed(() => {
  if (refundRows.value.length === 0) return null
  const devices = new Set<string>()
  const refundOrders = new Set<string>()
  const originalOrders = new Set<string>()
  let successful = 0
  let otherStatus = 0
  let amountOnlyCandidates = 0
  let fullReturnCandidates = 0
  let currentRefundNo = ''
  let currentOriginalNo = ''
  let currentRefundAmount = 0
  let currentLineAmount = 0
  let currentDevice = ''
  let currentStatus = ''

  function finishCurrent() {
    if (!currentRefundNo) return
    refundOrders.add(currentRefundNo)
    if (currentOriginalNo) originalOrders.add(currentOriginalNo)
    if (currentDevice) devices.add(currentDevice)
    if (!currentStatus || currentStatus === '退款成功') successful += 1
    else otherStatus += 1
    if (currentRefundAmount > 0 && currentLineAmount > 0 && Math.abs(currentRefundAmount - currentLineAmount) <= 0.01) {
      fullReturnCandidates += 1
    } else {
      amountOnlyCandidates += 1
    }
  }

  for (const row of refundRows.value) {
    if (row.refundOrderNo) {
      finishCurrent()
      currentRefundNo = row.refundOrderNo
      currentOriginalNo = row.originalOrderNo
      currentRefundAmount = row.refundAmount
      currentLineAmount = 0
      currentDevice = row.deviceName
      currentStatus = row.refundStatus
    }
    if (!currentRefundNo) continue
    currentLineAmount += Math.max(0, row.quantity * row.unitPrice)
  }
  finishCurrent()

  return {
    total: refundRows.value.length,
    devices: Array.from(devices),
    refundOrders: refundOrders.size,
    originalOrders: originalOrders.size,
    successful,
    otherStatus,
    fullReturnCandidates,
    amountOnlyCandidates
  }
})

const currentRowsCount = computed(() => {
  if (activeMode.value === 'orders') return rows.value.length
  if (activeMode.value === 'settlements') return settlementRows.value.length
  return refundRows.value.length
})

function isImportableRow(row: ZnOrderRow) {
  return row.status === '已完成'
    && !!row.vendorProductName
    && row.quantity > 0
}

function normalizeProductKeyName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/毫升/gi, 'ml')
    .replace(/克/gi, 'g')
    .replace(/升/gi, 'l')
    .replace(/[（）()【】[\]{}<>《》"'“”‘’、，,。.!！?？:：;；\s_\-—/\\|+*=~`·￥$#@%^&]/g, '')
    .replace(/[^0-9a-z\u4e00-\u9fa5]/g, '')
}

function productKey(row: ZnOrderRow) {
  return `${row.deviceCode}|${normalizeProductKeyName(row.vendorProductName)}`
}

function mergeSummary(target: ImportSummary, next: ImportSummary) {
  target.ordersImported += next.ordersImported || 0
  target.ordersDuplicate += next.ordersDuplicate || 0
  target.ordersSkipped += next.ordersSkipped || 0
  target.linesImported += next.linesImported || 0
  target.productsCreated += next.productsCreated || 0
  target.productsExisting = (target.productsExisting || 0) + (next.productsExisting || 0)
  target.productsStandardized = (target.productsStandardized || 0) + (next.productsStandardized || 0)
  target.costsMatched = (target.costsMatched || 0) + (next.costsMatched || 0)
  target.costsMissing = (target.costsMissing || 0) + (next.costsMissing || 0)
  target.ordersReconciled = (target.ordersReconciled || 0) + (next.ordersReconciled || 0)
  target.warnings += next.warnings || 0
}

function chunkRowsByOrder(sourceRows: ZnOrderRow[], batchSize: number) {
  const batches: ZnOrderRow[][] = []
  let current: ZnOrderRow[] = []
  const currentOrders = new Set<string>()
  let lastOrderNo = ''
  for (const row of sourceRows) {
    const orderNo = row.vendorOrderNo || lastOrderNo || `row-${current.length}`
    if (current.length > 0 && !currentOrders.has(orderNo) && currentOrders.size >= batchSize) {
      batches.push(current)
      current = []
      currentOrders.clear()
    }
    current.push(row)
    currentOrders.add(orderNo)
    if (row.vendorOrderNo) lastOrderNo = row.vendorOrderNo
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function setMode(mode: ImportMode) {
  activeMode.value = mode
  fileName.value = ''
  errorMessage.value = ''
  importProgress.value = ''
  productResult.value = null
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parsing.value = true
  errorMessage.value = ''
  result.value = null
  productResult.value = null
  settlementResult.value = null
  refundResult.value = null
  if (activeMode.value === 'orders') rows.value = []
  else if (activeMode.value === 'settlements') settlementRows.value = []
  else refundRows.value = []
  fileName.value = file.name

  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('Excel 文件没有数据 sheet')
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error('Excel 文件 sheet 内容为空')
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (activeMode.value === 'orders') {
      const parsed = json
        .map(normalizeZnOrderRow)
        .filter((row): row is ZnOrderRow => row !== null)
      if (parsed.length === 0) throw new Error('未解析出任何订单行，请检查表头')
      rows.value = parsed
    } else if (activeMode.value === 'settlements') {
      const parsed = json
        .map(normalizeZnSettlementRow)
        .filter((row): row is ZnSettlementRow => row !== null)
      if (parsed.length === 0) throw new Error('未解析出任何结算行，请检查表头')
      settlementRows.value = parsed
    } else {
      const parsed = json
        .map(normalizeZnRefundRow)
        .filter((row): row is ZnRefundRow => row !== null)
      if (parsed.length === 0) throw new Error('未解析出任何退款行，请检查表头')
      refundRows.value = parsed
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Excel 解析失败'
    fileName.value = ''
  } finally {
    parsing.value = false
    input.value = ''
  }
}

async function importProductsFromOrders(silent = false) {
  if (rows.value.length === 0) return null
  if (!silent) importProgress.value = '正在从订单明细提取独立商品并新建商品档案...'
  const response = await api.request<ProductImportResult>('/integrations/zn/import-products', {
    method: 'POST',
    body: { orders: rows.value }
  })
  productResult.value = response
  if (!silent) {
    toast.show(
      `已新建 ${response.summary.productsCreated} 个商品，已有 ${response.summary.productsExisting} 个`,
      'success'
    )
  }
  return response
}

async function submitOrders() {
  if (rows.value.length === 0) return
  if (!productResult.value) await importProductsFromOrders(true)
  const batches = chunkRowsByOrder(rows.value, IMPORT_BATCH_SIZE)
  const merged: ImportResult = {
    summary: {
      ordersImported: 0,
      ordersDuplicate: 0,
      ordersSkipped: 0,
      linesImported: 0,
      productsCreated: 0,
      productsExisting: 0,
      productsStandardized: 0,
      costsMatched: 0,
      costsMissing: 0,
      ordersReconciled: 0,
      warnings: 0
    },
    warnings: []
  }
  for (let index = 0; index < batches.length; index += 1) {
    importProgress.value = `正在导入第 ${index + 1} / ${batches.length} 批...`
    const response = await api.request<ImportResult>('/integrations/zn/import', {
      method: 'POST',
      body: { orders: batches[index] }
    })
    mergeSummary(merged.summary, response.summary)
    merged.warnings.push(...response.warnings)
  }
  merged.summary.warnings = merged.warnings.length
  result.value = merged
  toast.show(
    `已导入 ${merged.summary.ordersImported} 单，重复 ${merged.summary.ordersDuplicate}，跳过 ${merged.summary.ordersSkipped}`,
    'success'
  )
}

async function submitProductsOnly() {
  if (rows.value.length === 0) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await importProductsFromOrders(false)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '商品预导入失败'
    toast.show(errorMessage.value, 'danger')
  } finally {
    submitting.value = false
    importProgress.value = ''
  }
}

async function submitSettlements() {
  if (settlementRows.value.length === 0) return
  importProgress.value = '正在回写交易账单结算金额...'
  const response = await api.request<SettlementResult>('/integrations/zn/import-settlement', {
    method: 'POST',
    body: { settlements: settlementRows.value }
  })
  settlementResult.value = response
  toast.show(
    `已更新 ${response.summary.settlementsUpdated} 笔结算，未匹配 ${response.summary.settlementsMissing}`,
    'success'
  )
}

async function submitRefunds() {
  if (refundRows.value.length === 0) return
  importProgress.value = '正在导入退款明细...'
  const response = await api.request<RefundResult>('/integrations/zn/import-refunds', {
    method: 'POST',
    body: { refunds: refundRows.value }
  })
  refundResult.value = response
  toast.show(
    `已导入 ${response.summary.refundsImported} 笔退款，未匹配 ${response.summary.refundsMissing}`,
    'success'
  )
}

async function submit() {
  if (currentRowsCount.value === 0) return
  submitting.value = true
  errorMessage.value = ''
  importProgress.value = ''
  try {
    if (activeMode.value === 'orders') await submitOrders()
    else if (activeMode.value === 'settlements') await submitSettlements()
    else await submitRefunds()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导入失败'
    toast.show(errorMessage.value, 'danger')
  } finally {
    submitting.value = false
    importProgress.value = ''
  }
}

function reset() {
  if (activeMode.value === 'orders') rows.value = []
  else if (activeMode.value === 'settlements') settlementRows.value = []
  else refundRows.value = []
  fileName.value = ''
  result.value = null
  productResult.value = null
  settlementResult.value = null
  refundResult.value = null
  errorMessage.value = ''
  importProgress.value = ''
}
</script>

<template>
  <SettingsSection title="1号机 / 2号机 销售导入" description="从 zn 平台导出订单明细 Excel，浏览器本地解析后写入数据库。设备编号 → 机型映射见 docs/设备映射与数据来源.md。">
    <template #aside>
      <StatusBadge label="Excel 导入" tone="neutral" />
    </template>

    <div class="zn-import">
      <div class="zn-import__tabs" role="tablist" aria-label="zn Excel 导入类型">
        <button
          type="button"
          :class="['zn-import__tab', { 'zn-import__tab--active': activeMode === 'orders' }]"
          :aria-selected="activeMode === 'orders'"
          role="tab"
          @click="setMode('orders')"
        >
          订单明细
        </button>
        <button
          type="button"
          :class="['zn-import__tab', { 'zn-import__tab--active': activeMode === 'settlements' }]"
          :aria-selected="activeMode === 'settlements'"
          role="tab"
          @click="setMode('settlements')"
        >
          交易账单
        </button>
        <button
          type="button"
          :class="['zn-import__tab', { 'zn-import__tab--active': activeMode === 'refunds' }]"
          :aria-selected="activeMode === 'refunds'"
          role="tab"
          @click="setMode('refunds')"
        >
          退款明细
        </button>
      </div>

      <div class="zn-import__upload">
        <label class="zn-import__file">
          <input
            type="file"
            accept=".xlsx,.xls"
            :disabled="parsing || submitting"
            @change="onFileChange"
          >
          <span>
            {{
              fileName
                || (activeMode === 'orders'
                  ? '选择订单明细 .xlsx'
                  : activeMode === 'settlements'
                    ? '选择交易账单 .xlsx'
                    : '选择退款明细 .xlsx')
            }}
          </span>
        </label>
        <p v-if="activeMode === 'orders'" class="zn-import__hint">
          支持 zn 平台后台 → 账户信息 → 订单明细 导出的原始 Excel；只导入「已完成」状态、无退款的订单。
        </p>
        <p v-else-if="activeMode === 'settlements'" class="zn-import__hint">
          支持 zn 平台后台 → 账户信息 → 交易账单 导出的原始 Excel；按订单号回写手续费、算法服务费与实收金额。
        </p>
        <p v-else class="zn-import__hint">
          支持 zn 平台后台 → 退款明细 导出的原始 Excel；全额退款回补库存，部分退款只记退款金额。
        </p>
      </div>

      <p v-if="errorMessage" class="zn-import__error">
        {{ errorMessage }}
      </p>
      <p v-if="importProgress" class="zn-import__progress">
        {{ importProgress }}
      </p>

      <section v-if="activeMode === 'orders' && summaryCount" class="zn-import__summary">
        <div class="zn-import__summary-item">
          <span>总行数</span>
          <strong>{{ summaryCount.total }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>已完成</span>
          <strong>{{ summaryCount.completed }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>取消 / 其他</span>
          <strong>{{ summaryCount.canceled }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>含退款</span>
          <strong>{{ summaryCount.refunded }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>预计导入行</span>
          <strong>{{ summaryCount.importableRows }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>预计导入单</span>
          <strong>{{ summaryCount.importableOrders }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>独立商品</span>
          <strong>{{ summaryCount.importableProducts }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>设备数</span>
          <strong>{{ summaryCount.devices.length }}</strong>
        </div>
      </section>

      <section v-if="activeMode === 'settlements' && settlementSummaryCount" class="zn-import__summary">
        <div class="zn-import__summary-item">
          <span>总行数</span>
          <strong>{{ settlementSummaryCount.total }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>订单数</span>
          <strong>{{ settlementSummaryCount.orders }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>收入行</span>
          <strong>{{ settlementSummaryCount.incomeRows }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>支出 / 其他</span>
          <strong>{{ settlementSummaryCount.expenseRows }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>设备数</span>
          <strong>{{ settlementSummaryCount.devices.length }}</strong>
        </div>
      </section>

      <section v-if="activeMode === 'refunds' && refundSummaryCount" class="zn-import__summary">
        <div class="zn-import__summary-item">
          <span>总行数</span>
          <strong>{{ refundSummaryCount.total }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>退款单</span>
          <strong>{{ refundSummaryCount.refundOrders }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>原订单</span>
          <strong>{{ refundSummaryCount.originalOrders }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>退款成功</span>
          <strong>{{ refundSummaryCount.successful }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>全额回补</span>
          <strong>{{ refundSummaryCount.fullReturnCandidates }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>仅金额</span>
          <strong>{{ refundSummaryCount.amountOnlyCandidates }}</strong>
        </div>
        <div class="zn-import__summary-item">
          <span>设备数</span>
          <strong>{{ refundSummaryCount.devices.length }}</strong>
        </div>
      </section>

      <div v-if="currentRowsCount > 0" class="zn-import__actions">
        <AppButton type="button" variant="secondary" :disabled="submitting" @click="reset">
          重新选择
        </AppButton>
        <AppButton
          v-if="activeMode === 'orders'"
          type="button"
          variant="secondary"
          :loading="submitting"
          @click="submitProductsOnly"
        >
          先新建商品
        </AppButton>
        <AppButton type="button" :loading="submitting" @click="submit">
          {{
            activeMode === 'orders'
              ? `确认导入 ${rows.length} 行`
              : activeMode === 'settlements'
                ? `确认回写 ${settlementRows.length} 行`
                : `确认导入 ${refundRows.length} 行`
          }}
        </AppButton>
      </div>

      <section v-if="productResult" class="zn-import__result">
        <h3>商品预导入完成</h3>
        <div class="zn-import__summary">
          <div class="zn-import__summary-item">
            <span>独立商品</span>
            <strong>{{ productResult.summary.productsParsed }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>新建商品</span>
            <strong>{{ productResult.summary.productsCreated }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>已有商品</span>
            <strong>{{ productResult.summary.productsExisting }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>标准化改名</span>
            <strong>{{ productResult.summary.productsStandardized }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>跳过行</span>
            <strong>{{ productResult.summary.rowsSkipped }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>警告</span>
            <strong>{{ productResult.summary.warnings }}</strong>
          </div>
        </div>
        <details v-if="productResult.warnings.length > 0" class="zn-import__warnings">
          <summary>警告明细（{{ productResult.warnings.length }}）</summary>
          <ul>
            <li v-for="(warning, index) in productResult.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
      </section>

      <section v-if="result" class="zn-import__result">
        <h3>导入完成</h3>
        <div class="zn-import__summary">
          <div class="zn-import__summary-item">
            <span>订单导入</span>
            <strong>{{ result.summary.ordersImported }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>订单重复</span>
            <strong>{{ result.summary.ordersDuplicate }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>订单跳过</span>
            <strong>{{ result.summary.ordersSkipped }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>明细行</span>
            <strong>{{ result.summary.linesImported }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>新建商品</span>
            <strong>{{ result.summary.productsCreated }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>成本匹配</span>
            <strong>{{ result.summary.costsMatched || 0 }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>成本未匹配</span>
            <strong>{{ result.summary.costsMissing || 0 }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>订单校正</span>
            <strong>{{ result.summary.ordersReconciled || 0 }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>警告</span>
            <strong>{{ result.summary.warnings }}</strong>
          </div>
        </div>
        <details v-if="result.warnings.length > 0" class="zn-import__warnings">
          <summary>警告明细（{{ result.warnings.length }}）</summary>
          <ul>
            <li v-for="(warning, index) in result.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
      </section>

      <section v-if="settlementResult" class="zn-import__result">
        <h3>结算回写完成</h3>
        <div class="zn-import__summary">
          <div class="zn-import__summary-item">
            <span>已处理</span>
            <strong>{{ settlementResult.summary.settlementsProcessed }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>已更新</span>
            <strong>{{ settlementResult.summary.settlementsUpdated }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>已跳过</span>
            <strong>{{ settlementResult.summary.settlementsSkipped }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>未匹配</span>
            <strong>{{ settlementResult.summary.settlementsMissing }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>警告</span>
            <strong>{{ settlementResult.summary.warnings }}</strong>
          </div>
        </div>
        <details v-if="settlementResult.warnings.length > 0" class="zn-import__warnings">
          <summary>警告明细（{{ settlementResult.warnings.length }}）</summary>
          <ul>
            <li v-for="(warning, index) in settlementResult.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
      </section>

      <section v-if="refundResult" class="zn-import__result">
        <h3>退款导入完成</h3>
        <div class="zn-import__summary">
          <div class="zn-import__summary-item">
            <span>解析退款单</span>
            <strong>{{ refundResult.summary.refundsParsed }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>已导入</span>
            <strong>{{ refundResult.summary.refundsImported }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>重复</span>
            <strong>{{ refundResult.summary.refundsDuplicate }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>未匹配</span>
            <strong>{{ refundResult.summary.refundsMissing }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>明细行</span>
            <strong>{{ refundResult.summary.linesImported }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>回补库存</span>
            <strong>{{ refundResult.summary.stockRestored }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>仅金额</span>
            <strong>{{ refundResult.summary.amountOnly }}</strong>
          </div>
          <div class="zn-import__summary-item">
            <span>警告</span>
            <strong>{{ refundResult.summary.warnings }}</strong>
          </div>
        </div>
        <details v-if="refundResult.warnings.length > 0" class="zn-import__warnings">
          <summary>警告明细（{{ refundResult.warnings.length }}）</summary>
          <ul>
            <li v-for="(warning, index) in refundResult.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
      </section>
    </div>
  </SettingsSection>
</template>

<style scoped>
.zn-import {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.zn-import__upload {
  display: grid;
  gap: var(--space-2);
}

.zn-import__tabs {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: min(480px, 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 3px;
  background: var(--color-surface-subtle);
}

.zn-import__tab {
  min-height: 36px;
  border: 0;
  border-radius: calc(var(--radius-2) - 3px);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.zn-import__tab--active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.zn-import__file {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-subtle);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.zn-import__file:hover {
  border-color: var(--color-primary);
}

.zn-import__file input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.zn-import__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.zn-import__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.zn-import__summary-item {
  min-width: 0;
  display: grid;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.zn-import__summary-item span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.zn-import__summary-item strong {
  font-variant-numeric: tabular-nums;
}

.zn-import__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.zn-import__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 700;
}

.zn-import__progress {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.zn-import__result h3 {
  margin: 0 0 var(--space-2);
  font-size: 15px;
}

.zn-import__warnings {
  margin-top: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.zn-import__warnings summary {
  cursor: pointer;
  font-weight: 800;
}

.zn-import__warnings ul {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding-left: var(--space-4);
  color: var(--color-text-muted);
  line-height: 1.6;
}

@media (max-width: 900px) {
  .zn-import__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .zn-import__summary {
    grid-template-columns: 1fr;
  }

  .zn-import__actions {
    display: grid;
    justify-content: stretch;
  }

  .zn-import__actions :deep(.app-button) {
    width: 100%;
  }
}
</style>
