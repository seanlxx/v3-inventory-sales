<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { ProfitSalesRecord } from '~/types/profit'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  records: readonly ProfitSalesRecord[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  retry: []
  view: [record: ProfitSalesRecord]
  edit: [record: ProfitSalesRecord]
  void: [record: ProfitSalesRecord]
}>()

type SortKey = 'recordDate' | 'type' | 'machineId' | 'items' | 'netRevenue' | 'signedCogs' | 'fees' | 'grossProfit' | 'status'
type SortDirection = 'asc' | 'desc'

const sortKey = shallowRef<SortKey | null>(null)
const sortDirection = shallowRef<SortDirection>('desc')

const defaultSortDirection: Record<SortKey, SortDirection> = {
  recordDate: 'desc',
  type: 'asc',
  machineId: 'asc',
  items: 'asc',
  netRevenue: 'desc',
  signedCogs: 'desc',
  fees: 'desc',
  grossProfit: 'desc',
  status: 'asc'
}

function typeLabel(type: ProfitSalesRecord['type']) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  return '销售'
}

function typeTone(type: ProfitSalesRecord['type']) {
  if (type === 'refund') return 'warning'
  if (type === 'loss') return 'danger'
  return 'success'
}

function profitTone(record: ProfitSalesRecord) {
  if (record.status === 'voided') return 'neutral'
  if (Number(record.grossProfit) > 0) return 'success'
  if (Number(record.netRevenue) > 0) return 'warning'
  return 'neutral'
}

function firstItems(record: ProfitSalesRecord) {
  return record.items.slice(0, 3).map(item => item.productName).join(' / ')
}

function sortValue(record: ProfitSalesRecord, key: SortKey) {
  if (key === 'type') return typeLabel(record.type)
  if (key === 'items') return firstItems(record) || record.source
  if (key === 'fees') return Number(record.fees) + Number(record.discount)
  if (key === 'status') return record.status === 'voided' ? '已作废' : '有效'
  return record[key]
}

function compareValues(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    return (Number(left) || 0) - (Number(right) || 0)
  }
  return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  })
}

const sortedRecords = computed(() => {
  if (!sortKey.value) return props.records
  return [...props.records]
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const result = compareValues(
        sortValue(left.record, sortKey.value as SortKey),
        sortValue(right.record, sortKey.value as SortKey)
      )
      const directed = sortDirection.value === 'asc' ? result : -result
      return directed || left.index - right.index
    })
    .map(item => item.record)
})

function updateSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = defaultSortDirection[key]
}

function sortLabel(key: SortKey) {
  if (sortKey.value !== key) return ''
  return sortDirection.value === 'asc' ? '升序' : '降序'
}

function sortSymbol(key: SortKey) {
  if (sortKey.value !== key) return '↕'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

function ariaSort(key: SortKey) {
  if (sortKey.value !== key) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}

function canMutate(record: ProfitSalesRecord) {
  return record.status === 'active' && !record.legacySalesId
}
</script>

<template>
  <section class="profit-sales-table" aria-label="销售收入记录">
    <div class="profit-sales-table__scroll">
      <table class="profit-sales-table__table">
        <thead>
          <tr>
            <th scope="col" :aria-sort="ariaSort('recordDate')">
              <button class="profit-sales-table__sort" type="button" @click="updateSort('recordDate')">
                <span>日期</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('recordDate') }}</span>
                <span class="sr-only">{{ sortLabel('recordDate') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('type')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('type')">
                <span>类型</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('type') }}</span>
                <span class="sr-only">{{ sortLabel('type') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('machineId')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('machineId')">
                <span>设备</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('machineId') }}</span>
                <span class="sr-only">{{ sortLabel('machineId') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__th--items" :aria-sort="ariaSort('items')">
              <button class="profit-sales-table__sort" type="button" @click="updateSort('items')">
                <span>商品明细</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('items') }}</span>
                <span class="sr-only">{{ sortLabel('items') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('netRevenue')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('netRevenue')">
                <span>收入</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('netRevenue') }}</span>
                <span class="sr-only">{{ sortLabel('netRevenue') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('signedCogs')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('signedCogs')">
                <span>成本</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('signedCogs') }}</span>
                <span class="sr-only">{{ sortLabel('signedCogs') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('fees')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('fees')">
                <span>费用</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('fees') }}</span>
                <span class="sr-only">{{ sortLabel('fees') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('grossProfit')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('grossProfit')">
                <span>毛利</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('grossProfit') }}</span>
                <span class="sr-only">{{ sortLabel('grossProfit') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center" :aria-sort="ariaSort('status')">
              <button class="profit-sales-table__sort profit-sales-table__sort--center" type="button" @click="updateSort('status')">
                <span>状态</span>
                <span class="profit-sales-table__sort-icon" aria-hidden="true">{{ sortSymbol('status') }}</span>
                <span class="sr-only">{{ sortLabel('status') }}</span>
              </button>
            </th>
            <th scope="col" class="profit-sales-table__center">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="profit-sales-table__state" colspan="10">正在加载销售记录</td>
          </tr>
          <tr v-else-if="props.error">
            <td class="profit-sales-table__state profit-sales-table__state--error" colspan="10">
              <div class="profit-sales-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.records.length === 0">
            <td class="profit-sales-table__state" colspan="10">没有符合筛选条件的销售记录</td>
          </tr>
          <tr v-for="record in sortedRecords" v-else :key="record.id">
            <td class="numeric">{{ record.recordDate }}</td>
            <td class="profit-sales-table__center">
              <StatusBadge :label="typeLabel(record.type)" :tone="typeTone(record.type)" />
            </td>
            <td class="profit-sales-table__center">{{ record.machineId }}</td>
            <td>
              <div class="profit-sales-table__items">
                <strong :title="firstItems(record)">{{ firstItems(record) || record.source }}</strong>
                <span>{{ record.externalId || record.legacySalesId || record.id }}</span>
              </div>
            </td>
            <td class="profit-sales-table__center numeric">{{ formatMoney(record.netRevenue) }}</td>
            <td class="profit-sales-table__center numeric">{{ formatMoney(record.signedCogs) }}</td>
            <td class="profit-sales-table__center numeric">{{ formatMoney(record.fees + record.discount) }}</td>
            <td class="profit-sales-table__center numeric">
              <StatusBadge :label="formatMoney(record.grossProfit)" :tone="profitTone(record)" />
            </td>
            <td class="profit-sales-table__center">
              <StatusBadge
                :label="record.status === 'voided' ? '已作废' : '有效'"
                :tone="record.status === 'voided' ? 'warning' : 'success'"
              />
            </td>
            <td class="profit-sales-table__center">
              <div class="profit-sales-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('view', record)">
                  查看
                </AppButton>
                <template v-if="canMutate(record)">
                  <AppButton size="sm" variant="secondary" @click="emit('edit', record)">
                    编辑
                  </AppButton>
                  <AppButton size="sm" variant="ghost" @click="emit('void', record)">
                    作废
                  </AppButton>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="profit-sales-table__cards" aria-label="销售收入移动列表">
      <MobileStateCard v-if="props.loading" title="正在加载销售记录" />
      <MobileStateCard v-else-if="props.error" :title="props.error.message" tone="danger">
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </MobileStateCard>
      <MobileStateCard
        v-else-if="props.records.length === 0"
        title="没有销售记录"
        description="当前筛选条件下没有结果"
      />
      <template v-else>
        <MobileCard
          v-for="record in sortedRecords"
          :key="record.id"
          class="profit-sales-table__card"
          :accent="record.status === 'voided' ? 'warning' : 'primary'"
        >
          <header class="profit-sales-table__card-header">
            <div class="profit-sales-table__card-main">
              <strong class="profit-sales-table__card-title">{{ record.recordDate }} · {{ record.machineId }}</strong>
              <span>{{ firstItems(record) || record.source }}</span>
            </div>
            <StatusBadge :label="typeLabel(record.type)" :tone="typeTone(record.type)" />
          </header>
          <div class="profit-sales-table__card-grid">
            <span>收入 {{ formatMoney(record.netRevenue) }}</span>
            <span>成本 {{ formatMoney(record.signedCogs) }}</span>
            <span>费用 {{ formatMoney(record.fees + record.discount) }}</span>
            <span>毛利 {{ formatMoney(record.grossProfit) }}</span>
            <span>数量 {{ formatQuantity(record.quantity) }}</span>
            <span>{{ record.status === 'voided' ? '已作废' : '有效' }}</span>
          </div>
          <footer class="profit-sales-table__card-actions">
            <AppButton size="sm" variant="secondary" @click="emit('view', record)">
              查看
            </AppButton>
            <template v-if="canMutate(record)">
              <AppButton size="sm" variant="secondary" @click="emit('edit', record)">
                编辑
              </AppButton>
              <AppButton size="sm" variant="ghost" @click="emit('void', record)">
                作废
              </AppButton>
            </template>
          </footer>
        </MobileCard>
      </template>
    </div>
  </section>
</template>

<style scoped>
.profit-sales-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.profit-sales-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.profit-sales-table__table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  table-layout: fixed;
}

.profit-sales-table__th--items {
  width: 300px;
}

.profit-sales-table__table th,
.profit-sales-table__table td {
  height: 54px;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  vertical-align: middle;
}

.profit-sales-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.profit-sales-table__sort {
  width: 100%;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}

.profit-sales-table__sort--center {
  justify-content: center;
}

.profit-sales-table__sort-icon {
  color: var(--color-text-soft);
  font-size: 11px;
  line-height: 1;
}

.profit-sales-table__sort:hover,
.profit-sales-table__sort:focus-visible {
  color: var(--color-primary);
}

.profit-sales-table__sort:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  border-radius: var(--radius-1);
}

.profit-sales-table__center {
  text-align: center !important;
}

.profit-sales-table__items {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.profit-sales-table__items strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-sales-table__items span {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-soft);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-sales-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.profit-sales-table__state--error {
  color: var(--color-danger);
}

.profit-sales-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.profit-sales-table__actions {
  display: inline-flex;
  justify-content: center;
  gap: var(--space-2);
}

.profit-sales-table__cards {
  display: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background-color: var(--color-surface-subtle);
}

@media (max-width: 760px) {
  .profit-sales-table {
    border: 0;
    background: transparent;
  }

  .profit-sales-table__scroll {
    display: none;
  }

  .profit-sales-table__cards {
    display: grid;
    gap: var(--mobile-section-gap);
  }

  .profit-sales-table__card {
    display: grid;
    gap: 10px;
    padding: var(--mobile-card-padding);
  }

  .profit-sales-table__card-header {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .profit-sales-table__card-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .profit-sales-table__card-title {
    min-width: 0;
    color: var(--mobile-text);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.35;
    word-break: break-word;
  }

  .profit-sales-table__card-main span {
    color: var(--mobile-muted);
    font-size: 12px;
  }

  .profit-sales-table__card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding-top: 9px;
    border-top: 1px solid var(--mobile-divider);
    color: var(--mobile-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .profit-sales-table__card-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: var(--space-2);
  }
}
</style>
