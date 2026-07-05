<script setup lang="ts">
import type { ProfitPurchaseRecord } from '~/types/profit'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  record: ProfitPurchaseRecord
}>()

const emit = defineEmits<{
  close: []
}>()

function statusLabel(status: ProfitPurchaseRecord['status']) {
  return status === 'voided' ? '已作废' : '有效'
}
</script>

<template>
  <section class="profit-detail surface-panel" aria-label="进货明细">
    <header class="profit-detail__header">
      <div>
        <h2>进货明细</h2>
        <p>{{ props.record.legacyPurchaseId || props.record.id }}</p>
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
        <span>来源</span>
        <strong>{{ props.record.source || 'manual' }}</strong>
      </div>
      <div>
        <span>状态</span>
        <strong>{{ statusLabel(props.record.status) }}</strong>
      </div>
      <div>
        <span>数量</span>
        <strong>{{ formatQuantity(props.record.quantity) }}</strong>
      </div>
      <div>
        <span>总成本</span>
        <strong>{{ formatMoney(props.record.totalCost) }}</strong>
      </div>
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
          <span>单件成本</span>
          <strong>{{ formatMoney(item.unitCost) }}</strong>
        </div>
        <div>
          <span>小计</span>
          <strong>{{ formatMoney(item.totalCost) }}</strong>
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
.profit-detail__lines {
  display: grid;
  gap: var(--space-2);
}

.profit-detail__summary {
  grid-template-columns: repeat(5, minmax(0, 1fr));
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

.profit-detail__note {
  margin: 0;
  line-height: 1.6;
}

.profit-detail__line {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(110px, 0.35fr));
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

@media (max-width: 980px) {
  .profit-detail__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

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
  .profit-detail__line {
    grid-template-columns: 1fr;
  }
}
</style>
