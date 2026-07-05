<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { ProfitPurchaseRecord } from '~/types/profit'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  records: readonly ProfitPurchaseRecord[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  retry: []
  view: [record: ProfitPurchaseRecord]
  edit: [record: ProfitPurchaseRecord]
  void: [record: ProfitPurchaseRecord]
}>()

function statusLabel(status: ProfitPurchaseRecord['status']) {
  return status === 'voided' ? '已作废' : '有效'
}

function firstItems(record: ProfitPurchaseRecord) {
  return record.items.slice(0, 3).map(item => item.productName).join(' / ')
}

function canMutate(record: ProfitPurchaseRecord) {
  return record.status === 'active' && !record.legacyPurchaseId
}
</script>

<template>
  <section class="profit-purchase-table" aria-label="进货成本凭证">
    <div class="profit-purchase-table__scroll">
      <table class="profit-purchase-table__table">
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col" class="profit-purchase-table__th--source">来源</th>
            <th scope="col" class="profit-purchase-table__th--items">商品明细</th>
            <th scope="col" class="profit-purchase-table__center">数量</th>
            <th scope="col" class="profit-purchase-table__center">成本金额</th>
            <th scope="col" class="profit-purchase-table__center">状态</th>
            <th scope="col" class="profit-purchase-table__center">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="profit-purchase-table__state" colspan="7">正在加载成本凭证</td>
          </tr>
          <tr v-else-if="props.error">
            <td class="profit-purchase-table__state profit-purchase-table__state--error" colspan="7">
              <div class="profit-purchase-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.records.length === 0">
            <td class="profit-purchase-table__state" colspan="7">没有符合筛选条件的成本凭证</td>
          </tr>
          <tr v-for="record in props.records" v-else :key="record.id">
            <td class="numeric">{{ record.recordDate }}</td>
            <td>
              <div class="profit-purchase-table__source-cell">
                <strong>{{ record.source || 'manual' }}</strong>
                <span>{{ record.legacyPurchaseId || record.id }}</span>
              </div>
            </td>
            <td>
              <div class="profit-purchase-table__items">
                <strong :title="firstItems(record)">{{ firstItems(record) || '无明细' }}</strong>
                <span v-if="record.itemCount > 3">另 {{ formatQuantity(record.itemCount - 3) }} 项</span>
                <span v-else>{{ formatQuantity(record.itemCount) }} 项明细</span>
              </div>
            </td>
            <td class="profit-purchase-table__center numeric">{{ formatQuantity(record.quantity) }}</td>
            <td class="profit-purchase-table__center numeric">{{ formatMoney(record.totalCost) }}</td>
            <td class="profit-purchase-table__center">
              <StatusBadge
                :label="statusLabel(record.status)"
                :tone="record.status === 'voided' ? 'warning' : 'success'"
              />
            </td>
            <td class="profit-purchase-table__center">
              <div class="profit-purchase-table__actions">
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

    <div class="profit-purchase-table__cards" aria-label="进货成本移动列表">
      <MobileStateCard v-if="props.loading" title="正在加载成本凭证" />
      <MobileStateCard v-else-if="props.error" :title="props.error.message" tone="danger">
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </MobileStateCard>
      <MobileStateCard
        v-else-if="props.records.length === 0"
        title="没有成本凭证"
        description="当前筛选条件下没有结果"
      />
      <template v-else>
        <MobileCard
          v-for="record in props.records"
          :key="record.id"
          class="profit-purchase-table__card"
          :accent="record.status === 'voided' ? 'warning' : 'primary'"
        >
          <header class="profit-purchase-table__card-header">
            <div class="profit-purchase-table__card-main">
              <strong class="profit-purchase-table__card-title">{{ record.recordDate }} · {{ record.source || 'manual' }}</strong>
              <span>{{ record.legacyPurchaseId || record.id }}</span>
            </div>
            <StatusBadge
              :label="statusLabel(record.status)"
              :tone="record.status === 'voided' ? 'warning' : 'success'"
            />
          </header>
          <div class="profit-purchase-table__card-grid">
            <span>数量 {{ formatQuantity(record.quantity) }}</span>
            <span>成本 {{ formatMoney(record.totalCost) }}</span>
            <span>明细 {{ formatQuantity(record.itemCount) }} 项</span>
            <span>{{ firstItems(record) || '无明细' }}</span>
          </div>
          <footer class="profit-purchase-table__card-actions">
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
.profit-purchase-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.profit-purchase-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.profit-purchase-table__table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  table-layout: fixed;
}

.profit-purchase-table__th--source {
  width: 200px;
}

.profit-purchase-table__th--items {
  width: 340px;
}

.profit-purchase-table__table th,
.profit-purchase-table__table td {
  height: 54px;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
  vertical-align: middle;
}

.profit-purchase-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.profit-purchase-table__center {
  text-align: center !important;
}

.profit-purchase-table__source-cell,
.profit-purchase-table__items {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.profit-purchase-table__source-cell strong,
.profit-purchase-table__items strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-purchase-table__source-cell span,
.profit-purchase-table__items span {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-soft);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-purchase-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.profit-purchase-table__state--error {
  color: var(--color-danger);
}

.profit-purchase-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.profit-purchase-table__actions {
  display: inline-flex;
  justify-content: center;
  gap: var(--space-2);
}

.profit-purchase-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background-color: var(--color-surface-subtle);
}

@media (max-width: 760px) {
  .profit-purchase-table {
    border: 0;
    background: transparent;
  }

  .profit-purchase-table__scroll {
    display: none;
  }

  .profit-purchase-table__cards {
    display: grid;
    gap: var(--mobile-section-gap);
  }

  .profit-purchase-table__card {
    display: grid;
    gap: 10px;
    padding: var(--mobile-card-padding);
  }

  .profit-purchase-table__card-header {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .profit-purchase-table__card-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .profit-purchase-table__card-title {
    min-width: 0;
    color: var(--mobile-text);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.35;
    word-break: break-word;
  }

  .profit-purchase-table__card-main span {
    color: var(--mobile-muted);
    font-size: 12px;
  }

  .profit-purchase-table__card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding-top: 9px;
    border-top: 1px solid var(--mobile-divider);
    color: var(--mobile-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .profit-purchase-table__card-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: var(--space-2);
  }
}
</style>
