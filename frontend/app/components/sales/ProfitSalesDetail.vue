<script setup lang="ts">
import type { ProfitSalesRecord } from '~/types/profit'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  record: ProfitSalesRecord
}>()

const emit = defineEmits<{
  close: []
}>()

function typeLabel(type: ProfitSalesRecord['type']) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  return '销售'
}

function statusLabel(status: ProfitSalesRecord['status']) {
  return status === 'voided' ? '已作废' : '有效'
}
</script>

<template>
  <section class="profit-detail surface-panel" aria-label="销售明细">
    <header class="profit-detail__header">
      <div>
        <h2>销售明细</h2>
        <p>{{ props.record.externalId || props.record.legacySalesId || props.record.id }}</p>
      </div>
      <AppButton type="button" variant="ghost" @click="emit('close')">
        关闭
      </AppButton>
    </header>

    <div class="profit-detail__summary">
      <div>
        <span>日期</span>
        <strong>{{ props.record.recordDate }}</strong>
      </div>
      <div>
        <span>类型</span>
        <strong>{{ typeLabel(props.record.type) }}</strong>
      </div>
      <div>
        <span>设备</span>
        <strong>{{ props.record.machineId }}</strong>
      </div>
      <div>
        <span>状态</span>
        <strong>{{ statusLabel(props.record.status) }}</strong>
      </div>
      <div>
        <span>收入</span>
        <strong>{{ formatMoney(props.record.netRevenue) }}</strong>
      </div>
      <div>
        <span>成本</span>
        <strong>{{ formatMoney(props.record.signedCogs) }}</strong>
      </div>
      <div>
        <span>费用</span>
        <strong>{{ formatMoney(props.record.fees + props.record.discount) }}</strong>
      </div>
      <div>
        <span>毛利</span>
        <strong>{{ formatMoney(props.record.grossProfit) }}</strong>
      </div>
    </div>

    <div class="profit-detail__fees">
      <span>销售额 {{ formatMoney(props.record.grossAmount) }}</span>
      <span>退款 {{ formatMoney(props.record.refundAmount) }}</span>
      <span>手续费 {{ formatMoney(props.record.platformFee) }}</span>
      <span>服务费 {{ formatMoney(props.record.serviceFee) }}</span>
      <span>优惠 {{ formatMoney(props.record.discount) }}</span>
    </div>

    <p v-if="props.record.note" class="profit-detail__note">{{ props.record.note }}</p>

    <div class="profit-detail__lines">
      <article
        v-for="item in props.record.items"
        :key="item.id"
        class="profit-detail__line"
      >
        <div class="profit-detail__product">
          <strong>{{ item.productName }}</strong>
          <span>{{ item.productGlobalId }}</span>
        </div>
        <div>
          <span>数量</span>
          <strong>{{ formatQuantity(item.quantity) }}</strong>
        </div>
        <div>
          <span>单价</span>
          <strong>{{ formatMoney(item.unitPrice) }}</strong>
        </div>
        <div>
          <span>收入小计</span>
          <strong>{{ formatMoney(item.lineAmount) }}</strong>
        </div>
        <div>
          <span>单位成本</span>
          <strong>{{ formatMoney(item.unitCost) }}</strong>
        </div>
        <div>
          <span>成本小计</span>
          <strong>{{ formatMoney(item.lineCogs) }}</strong>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.profit-detail {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.profit-detail__header {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.profit-detail__header h2,
.profit-detail__header p {
  margin: 0;
}

.profit-detail__header h2 {
  font-size: 16px;
  line-height: 1.3;
}

.profit-detail__header p,
.profit-detail__note {
  color: var(--color-text-muted);
  font-size: 12px;
}

.profit-detail__summary,
.profit-detail__fees,
.profit-detail__lines {
  display: grid;
  gap: var(--space-2);
}

.profit-detail__summary {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.profit-detail__summary div,
.profit-detail__line {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.profit-detail__summary div {
  display: grid;
  gap: 4px;
  padding: var(--space-3);
}

.profit-detail__summary span,
.profit-detail__line span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profit-detail__summary strong,
.profit-detail__line strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-detail__fees {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.profit-detail__fees span {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.profit-detail__note {
  margin: 0;
  line-height: 1.6;
}

.profit-detail__line {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(5, minmax(92px, 0.28fr));
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3);
}

.profit-detail__line > div,
.profit-detail__product {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.profit-detail__product span {
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .profit-detail__summary,
  .profit-detail__fees,
  .profit-detail__line {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .profit-detail {
    padding: var(--space-3);
  }

  .profit-detail__header,
  .profit-detail__line {
    display: grid;
  }

  .profit-detail__summary,
  .profit-detail__fees,
  .profit-detail__line {
    grid-template-columns: 1fr;
  }
}
</style>
