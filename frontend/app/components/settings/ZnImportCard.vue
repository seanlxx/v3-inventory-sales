<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import { useToastStore } from '~/stores/toast'

type ImportSummary = {
  ordersImported: number
  ordersDuplicate: number
  ordersSkipped: number
  linesImported: number
  productsCreated: number
  warnings: number
}

type ImportResult = {
  summary: ImportSummary
  warnings: string[]
}

type ParsedRow = {
  vendorOrderNo: string
  status: string
  deviceCode: string
  vendorProductName: string
  vendorBarcode: string
  unitPrice: number
  quantity: number
  lineAmount: number
  refundAmount: number
  date: string
}

const api = useApi()
const toast = useToastStore()

const fileName = ref('')
const parsing = ref(false)
const submitting = ref(false)
const rows = ref<ParsedRow[]>([])
const result = ref<ImportResult | null>(null)
const errorMessage = ref('')

const summaryCount = computed(() => {
  if (rows.value.length === 0) return null
  const devices = new Set<string>()
  let completed = 0
  let canceled = 0
  for (const row of rows.value) {
    devices.add(row.deviceCode)
    if (row.status === '已完成') completed += 1
    else canceled += 1
  }
  return { total: rows.value.length, devices: Array.from(devices), completed, canceled }
})

function pickField(row: Record<string, unknown>, names: string[]): string {
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

function toNumber(value: string): number {
  if (!value) return 0
  const n = Number(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function normalizeRow(raw: Record<string, unknown>): ParsedRow | null {
  const vendorOrderNo = pickField(raw, ['订单号'])
  const status = pickField(raw, ['状态'])
  const deviceCode = pickField(raw, ['设备编号'])
  const vendorProductName = pickField(raw, ['商品名称'])
  const vendorBarcode = pickField(raw, ['商品条码'])
  const unitPrice = toNumber(pickField(raw, ['商品单价']))
  const quantity = Math.max(1, Number(pickField(raw, ['商品数量'])) || 1)
  const lineAmount = toNumber(pickField(raw, ['销售额', '价格']))
  const refundAmount = toNumber(pickField(raw, ['退款金额']))
  const date = pickField(raw, ['创建时间', '扣款时间'])

  if (!vendorOrderNo && !deviceCode) return null
  return {
    vendorOrderNo, status, deviceCode, vendorProductName, vendorBarcode,
    unitPrice, quantity, lineAmount, refundAmount, date
  }
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parsing.value = true
  errorMessage.value = ''
  result.value = null
  rows.value = []
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
    const parsed = json
      .map(normalizeRow)
      .filter((row): row is ParsedRow => row !== null)
    if (parsed.length === 0) throw new Error('未解析出任何订单行，请检查表头')
    rows.value = parsed
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Excel 解析失败'
    fileName.value = ''
  } finally {
    parsing.value = false
    input.value = ''
  }
}

async function submit() {
  if (rows.value.length === 0) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const response = await api.request<ImportResult>('/integrations/zn/import', {
      method: 'POST',
      body: { orders: rows.value }
    })
    result.value = response
    toast.show(
      `已导入 ${response.summary.ordersImported} 单，重复 ${response.summary.ordersDuplicate}，跳过 ${response.summary.ordersSkipped}`,
      'success'
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '导入失败'
    toast.show(errorMessage.value, 'danger')
  } finally {
    submitting.value = false
  }
}

function reset() {
  rows.value = []
  fileName.value = ''
  result.value = null
  errorMessage.value = ''
}
</script>

<template>
  <SettingsSection title="1号机 / 2号机 销售导入" description="从 zn 平台导出订单明细 Excel，浏览器本地解析后写入数据库。设备编号 → 机型映射见 docs/设备映射与数据来源.md。">
    <template #aside>
      <StatusBadge label="Excel 导入" tone="neutral" />
    </template>

    <div class="zn-import">
      <div class="zn-import__upload">
        <label class="zn-import__file">
          <input
            type="file"
            accept=".xlsx,.xls"
            :disabled="parsing || submitting"
            @change="onFileChange"
          >
          <span>{{ fileName || '选择订单明细 .xlsx' }}</span>
        </label>
        <p class="zn-import__hint">
          支持 zn 平台后台 → 账户信息 → 订单明细 导出的原始 Excel；只导入「已完成」状态、无退款的订单。
        </p>
      </div>

      <p v-if="errorMessage" class="zn-import__error">
        {{ errorMessage }}
      </p>

      <section v-if="summaryCount" class="zn-import__summary">
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
          <span>设备数</span>
          <strong>{{ summaryCount.devices.length }}</strong>
        </div>
      </section>

      <div v-if="rows.length > 0" class="zn-import__actions">
        <AppButton type="button" variant="secondary" :disabled="submitting" @click="reset">
          重新选择
        </AppButton>
        <AppButton type="button" :loading="submitting" @click="submit">
          确认导入 {{ rows.length }} 行
        </AppButton>
      </div>

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
