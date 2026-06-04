<script setup lang="ts">
import type { SalesOrder, SalesOrderType } from '~/types/sale'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'
import { displayMachineName } from '~/utils/machines'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  order: SalesOrder | null
}>()

const emit = defineEmits<{
  void: [order: SalesOrder]
}>()

function typeLabel(type?: SalesOrderType) {
  if (type === 'refund') return '退款'
  if (type === 'loss') return '损耗'
  return '销售'
}

function stockImpact(order: SalesOrder, quantity: number) {
  if (order.type === 'refund') return `库存增加 ${formatQuantity(quantity)}`
  return `库存减少 ${formatQuantity(quantity)}`
}

function moneyValue(value: number | null | undefined) {
  return Math.abs(Number(value) || 0)
}

function normalizeMoney(value: number) {
  return Math.abs(value) < 0.005 ? 0 : value
}

function negativeMoney(value: number) {
  const amount = moneyValue(value)
  return amount > 0 ? -amount : 0
}

function signedMoney(value: number) {
  return formatMoney(normalizeMoney(value))
}

function orderReceivedAmount(order: SalesOrder) {
  if (order.type === 'loss') return 0
  return moneyValue(order.receivedAmount)
}

function orderProfitAmount(order: SalesOrder) {
  const cost = moneyValue(order.totalCogs)
  if (order.type === 'loss') return -cost

  const profit = orderReceivedAmount(order) - cost
  return normalizeMoney(order.type === 'refund' ? -Math.abs(profit) : profit)
}

function itemProfitAmount(order: SalesOrder, item: SalesOrder['items'][number]) {
  const revenue = moneyValue(item.itemRevenue)
  const cogs = moneyValue(item.itemCogs)
  if (order.type === 'loss') return -cogs
  if (order.type === 'refund') return normalizeMoney(-revenue - (-cogs))
  return normalizeMoney(revenue - cogs)
}

function moneyToneClass(value: number) {
  if (value > 0) return 'sales-drawer__money--positive'
  if (value < 0) return 'sales-drawer__money--negative'
  return 'sales-drawer__money--neutral'
}

function financialRows(order: SalesOrder) {
  const totalAmount = moneyValue(order.totalAmount)
  const refundAmount = moneyValue(order.refundAmount) || totalAmount
  const platformFee = moneyValue(order.platformFee)
  const serviceFee = moneyValue(order.serviceFee)
  const discount = moneyValue(order.discount)
  const totalCogs = moneyValue(order.totalCogs)
  const receivedAmount = orderReceivedAmount(order)
  const profitAmount = orderProfitAmount(order)

  if (order.type === 'loss') {
    return [
      { label: '总成本', value: totalCogs, toneValue: 0 },
      { label: '损耗成本', value: negativeMoney(totalCogs), toneValue: negativeMoney(totalCogs) }
    ]
  }

  const incomeRows = order.type === 'refund'
    ? [
        { label: '退款金额', value: negativeMoney(refundAmount), toneValue: negativeMoney(refundAmount) },
        { label: '平台手续费', value: negativeMoney(platformFee), toneValue: negativeMoney(platformFee) },
        { label: '算法服务费', value: negativeMoney(serviceFee), toneValue: negativeMoney(serviceFee) },
        { label: '优惠', value: negativeMoney(discount), toneValue: negativeMoney(discount) },
        { label: '退款实收', value: receivedAmount, toneValue: receivedAmount },
        { label: '成本冲回', value: negativeMoney(totalCogs), toneValue: 0 }
      ]
    : [
        { label: '销售额', value: totalAmount, toneValue: totalAmount },
        { label: '平台手续费', value: negativeMoney(platformFee), toneValue: negativeMoney(platformFee) },
        { label: '算法服务费', value: negativeMoney(serviceFee), toneValue: negativeMoney(serviceFee) },
        { label: '优惠', value: negativeMoney(discount), toneValue: negativeMoney(discount) },
        { label: '实收', value: receivedAmount, toneValue: receivedAmount },
        { label: '总成本', value: totalCogs, toneValue: 0 }
      ]

  return [
    ...incomeRows,
    {
      label: order.type === 'refund' ? '退款利润' : '利润',
      value: profitAmount,
      toneValue: profitAmount
    }
  ]
}
</script>

<template>
  <AppDrawer
    v-model:open="open"
    :title="props.order ? `${typeLabel(props.order.type)}详情` : '单据详情'"
    description="库存变化来自服务端 stock_movements。"
  >
    <div v-if="props.order" class="sales-drawer">
      <section class="sales-drawer__summary">
        <div>
          <span>单号</span>
          <strong>{{ props.order.id }}</strong>
        </div>
        <div>
          <span>日期</span>
          <strong>{{ props.order.date }}</strong>
        </div>
        <div>
          <span>售货机</span>
          <strong>{{ displayMachineName(props.order.machineId) }}</strong>
        </div>
        <div>
          <span>金额</span>
          <strong>{{ formatMoney(props.order.totalAmount) }}</strong>
        </div>
        <div>
          <span>成本</span>
          <strong>{{ formatMoney(props.order.totalCogs) }}</strong>
        </div>
        <div>
          <span>{{ props.order.type === 'loss' ? '损耗成本' : '利润' }}</span>
          <strong class="sales-drawer__money" :class="moneyToneClass(orderProfitAmount(props.order))">
            {{ props.order.type === 'loss' ? signedMoney(-moneyValue(props.order.totalCogs)) : signedMoney(orderProfitAmount(props.order)) }}
          </strong>
        </div>
      </section>

      <section class="sales-drawer__meta">
        <StatusBadge
          :label="props.order.status === 'voided' ? '已作废' : '正常'"
          :tone="props.order.status === 'voided' ? 'warning' : 'success'"
        />
        <StatusBadge :label="typeLabel(props.order.type)" :tone="props.order.type === 'loss' ? 'danger' : props.order.type === 'refund' ? 'info' : 'success'" />
        <StatusBadge
          v-if="props.order.source === 'shengma'"
          label="盛码同步"
          tone="info"
        />
        <span>创建 {{ formatDateTime(props.order.createdAt) }}</span>
      </section>

      <div class="sales-drawer__items">
        <div v-for="item in props.order.items" :key="`${props.order.id}-${item.productId}`" class="sales-drawer__item">
          <div>
            <strong>{{ item.productName || item.productId }}</strong>
            <span>{{ stockImpact(props.order, item.quantity) }}</span>
          </div>
          <div class="sales-drawer__item-metrics">
            <div>
              <strong>{{ formatQuantity(item.quantity) }}</strong>
              <span>数量</span>
            </div>
            <div>
              <strong>{{ formatMoney(item.itemRevenue || 0) }}</strong>
              <span>收入</span>
            </div>
            <div>
              <strong>{{ formatMoney(item.itemCogs || 0) }}</strong>
              <span>成本</span>
            </div>
            <div>
              <strong class="sales-drawer__money" :class="moneyToneClass(itemProfitAmount(props.order, item))">
                {{ signedMoney(itemProfitAmount(props.order, item)) }}
              </strong>
              <span>{{ props.order.type === 'loss' ? '损耗成本' : '利润' }}</span>
            </div>
          </div>
        </div>
      </div>

      <section class="sales-drawer__summary sales-drawer__summary--financial" aria-label="费用与利润">
        <div v-for="row in financialRows(props.order)" :key="row.label">
          <span>{{ row.label }}</span>
          <strong class="sales-drawer__money" :class="moneyToneClass(row.toneValue)">
            {{ signedMoney(row.value) }}
          </strong>
        </div>
      </section>

      <p v-if="props.order.note" class="sales-drawer__note">
        {{ props.order.note }}
      </p>

      <AppButton
        variant="danger"
        :disabled="props.order.status === 'voided' || props.order.source === 'shengma'"
        @click="emit('void', props.order)"
      >
        作废单据
      </AppButton>
    </div>
  </AppDrawer>
</template>

<style scoped>
.sales-drawer {
  display: grid;
  gap: var(--space-4);
}

.sales-drawer__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.sales-drawer__summary--financial {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sales-drawer__summary div {
  min-width: 0;
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
}

.sales-drawer__summary span,
.sales-drawer__meta span,
.sales-drawer__item span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.sales-drawer__summary strong {
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.sales-drawer__money {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.sales-drawer__money--positive {
  color: var(--color-inbound);
}

.sales-drawer__money--negative {
  color: var(--color-danger);
}

.sales-drawer__money--neutral {
  color: var(--color-text-muted);
}

.sales-drawer__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.sales-drawer__items {
  display: grid;
  gap: var(--space-2);
}

.sales-drawer__item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, auto);
  align-items: start;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

.sales-drawer__item div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.sales-drawer__item div:last-child {
  text-align: right;
}

.sales-drawer__item-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, auto));
  justify-content: end;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
}

.sales-drawer__item-metrics div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.sales-drawer__note {
  margin: 0;
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 520px) {
  .sales-drawer__summary {
    grid-template-columns: 1fr;
  }

  .sales-drawer__item {
    grid-template-columns: 1fr;
  }

  .sales-drawer__item-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-content: stretch;
  }

  .sales-drawer__item div:last-child {
    text-align: left;
  }
}
</style>
