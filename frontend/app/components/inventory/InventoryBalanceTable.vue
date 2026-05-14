<script setup lang="ts">
import type { ApiError } from '~/types/api'
import type { InventoryBalance } from '~/types/inventory'
import { formatDateTime, formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  balances: readonly InventoryBalance[]
  loading?: boolean
  error?: ApiError | null
}>()

const emit = defineEmits<{
  movements: [balance: InventoryBalance]
  adjust: [balance: InventoryBalance]
  retry: []
}>()

function stockTone(balance: InventoryBalance) {
  if (Number(balance.quantityOnHand) <= 0) return 'danger'
  if (balance.isLowStock) return 'warning'
  return 'success'
}
</script>

<template>
  <section class="inventory-table" aria-label="库存余额表">
    <div class="inventory-table__scroll">
      <table class="inventory-table__table">
        <colgroup>
          <col class="inventory-table__col--product">
          <col class="inventory-table__col--category">
          <col class="inventory-table__col--machine">
          <col class="inventory-table__col--stock">
          <col class="inventory-table__col--price">
          <col class="inventory-table__col--value">
          <col class="inventory-table__col--status">
          <col class="inventory-table__col--updated">
          <col class="inventory-table__col--actions">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col">分类</th>
            <th scope="col">售货机</th>
            <th scope="col" class="inventory-table__number">现存</th>
            <th scope="col" class="inventory-table__number">均价</th>
            <th scope="col" class="inventory-table__number">库存金额</th>
            <th scope="col">状态</th>
            <th scope="col">更新时间</th>
            <th scope="col" class="inventory-table__actions-heading">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="props.loading">
            <td class="inventory-table__state" colspan="9">
              正在加载库存余额
            </td>
          </tr>
          <tr v-else-if="props.error">
            <td class="inventory-table__state inventory-table__state--error" colspan="9">
              <div class="inventory-table__state-stack">
                <strong>{{ props.error.message }}</strong>
                <AppButton variant="secondary" size="sm" @click="emit('retry')">
                  重试
                </AppButton>
              </div>
            </td>
          </tr>
          <tr v-else-if="props.balances.length === 0">
            <td class="inventory-table__state" colspan="9">
              没有符合筛选条件的库存余额
            </td>
          </tr>
          <tr v-for="balance in props.balances" v-else :key="`${balance.productId}:${balance.machineId}`">
            <td>
              <div class="inventory-table__name-cell">
                <div class="inventory-table__image" aria-hidden="true">
                  {{ balance.productName.slice(0, 1) || '库' }}
                </div>
                <div class="inventory-table__name-copy">
                  <strong>{{ balance.productName }}</strong>
                  <span>{{ balance.productId }}</span>
                </div>
              </div>
            </td>
            <td>
              <StatusBadge :label="balance.category || '其他'" tone="neutral" />
            </td>
            <td>{{ balance.machineId }}</td>
            <td class="inventory-table__number">
              <button class="inventory-table__stock-button" type="button" @click="emit('movements', balance)">
                <StatusBadge :label="`${formatQuantity(balance.quantityOnHand)} 件`" :tone="stockTone(balance)" />
                <span>查流水</span>
              </button>
            </td>
            <td class="inventory-table__number">
              {{ formatMoney(balance.avgCost) }}
            </td>
            <td class="inventory-table__number">
              {{ formatMoney(balance.inventoryValue) }}
            </td>
            <td>
              <StatusBadge
                :label="balance.isLowStock ? `低于 ${formatQuantity(balance.lowStockThreshold)} 件` : '正常'"
                :tone="balance.isLowStock ? 'warning' : 'success'"
              />
            </td>
            <td>{{ formatDateTime(balance.updatedAt) }}</td>
            <td class="inventory-table__actions-cell">
              <div class="inventory-table__actions">
                <AppButton size="sm" variant="secondary" @click="emit('movements', balance)">
                  流水
                </AppButton>
                <AppButton size="sm" @click="emit('adjust', balance)">
                  盘点
                </AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="inventory-table__cards" aria-label="库存余额移动列表">
      <div v-if="props.loading" class="inventory-table__card-state">
        正在加载库存余额
      </div>
      <div v-else-if="props.error" class="inventory-table__card-state inventory-table__card-state--error">
        <strong>{{ props.error.message }}</strong>
        <AppButton variant="secondary" size="sm" @click="emit('retry')">
          重试
        </AppButton>
      </div>
      <div v-else-if="props.balances.length === 0" class="inventory-table__card-state">
        没有符合筛选条件的库存余额
      </div>
      <article
        v-for="balance in props.balances"
        v-else
        :key="`${balance.productId}:${balance.machineId}`"
        class="inventory-table__card"
      >
        <header class="inventory-table__card-header">
          <div class="inventory-table__card-title">
            <div class="inventory-table__image" aria-hidden="true">
              {{ balance.productName.slice(0, 1) || '库' }}
            </div>
            <div>
              <strong>{{ balance.productName }}</strong>
              <span>{{ balance.productId }}</span>
            </div>
          </div>
          <StatusBadge
            :label="balance.isLowStock ? `低于 ${formatQuantity(balance.lowStockThreshold)} 件` : '正常'"
            :tone="balance.isLowStock ? 'warning' : 'success'"
          />
        </header>

        <dl class="inventory-table__card-grid">
          <div>
            <dt>分类</dt>
            <dd>{{ balance.category || '其他' }}</dd>
          </div>
          <div>
            <dt>售货机</dt>
            <dd>{{ balance.machineId }}</dd>
          </div>
          <div>
            <dt>现存</dt>
            <dd>
              <button class="inventory-table__card-stock" type="button" @click="emit('movements', balance)">
                <StatusBadge :label="`${formatQuantity(balance.quantityOnHand)} 件`" :tone="stockTone(balance)" />
              </button>
            </dd>
          </div>
          <div>
            <dt>均价</dt>
            <dd>{{ formatMoney(balance.avgCost) }}</dd>
          </div>
          <div>
            <dt>库存金额</dt>
            <dd>{{ formatMoney(balance.inventoryValue) }}</dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd>{{ formatDateTime(balance.updatedAt) }}</dd>
          </div>
        </dl>

        <div class="inventory-table__card-actions">
          <AppButton size="sm" variant="secondary" @click="emit('movements', balance)">
            流水
          </AppButton>
          <AppButton size="sm" @click="emit('adjust', balance)">
            盘点
          </AppButton>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.inventory-table {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.inventory-table__scroll {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.inventory-table__table {
  width: 100%;
  min-width: 1088px;
  border-collapse: collapse;
  table-layout: fixed;
}

.inventory-table__col--product {
  width: 300px;
}

.inventory-table__col--category {
  width: 72px;
}

.inventory-table__col--machine {
  width: 76px;
}

.inventory-table__col--stock {
  width: 104px;
}

.inventory-table__col--price {
  width: 84px;
}

.inventory-table__col--value {
  width: 104px;
}

.inventory-table__col--status {
  width: 96px;
}

.inventory-table__col--updated {
  width: 126px;
}

.inventory-table__col--actions {
  width: 126px;
}

.inventory-table__table th,
.inventory-table__table td {
  height: 54px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.inventory-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.inventory-table__table .inventory-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.inventory-table__table .inventory-table__actions-heading,
.inventory-table__table .inventory-table__actions-cell {
  padding-right: var(--space-2);
  padding-left: var(--space-2);
  text-align: center;
}

.inventory-table__name-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.inventory-table__image {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-info-soft);
  color: var(--color-info);
  font-weight: 800;
}

.inventory-table__name-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.inventory-table__name-copy strong,
.inventory-table__name-copy span {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inventory-table__name-copy span {
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}

.inventory-table__stock-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-text-soft);
  cursor: pointer;
  font-size: 12px;
}

.inventory-table__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.inventory-table__actions :deep(.app-button) {
  min-width: 46px;
}

.inventory-table__state {
  height: 140px;
  color: var(--color-text-muted);
  text-align: center;
}

.inventory-table__state--error {
  color: var(--color-danger);
}

.inventory-table__state-stack {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.inventory-table__cards {
  display: none;
}

tbody tr:last-child td {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .inventory-table {
    border: 0;
    background: transparent;
  }

  .inventory-table__scroll {
    display: none;
  }

  .inventory-table__cards {
    display: grid;
    gap: var(--space-3);
  }

  .inventory-table__card,
  .inventory-table__card-state {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3);
    background: var(--color-surface);
  }

  .inventory-table__card {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .inventory-table__card-state {
    min-height: 112px;
    display: grid;
    place-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: var(--color-text-muted);
    text-align: center;
  }

  .inventory-table__card-state--error {
    color: var(--color-danger);
  }

  .inventory-table__card-header,
  .inventory-table__card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .inventory-table__card-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .inventory-table__card-title > div:last-child {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .inventory-table__card-title strong,
  .inventory-table__card-title span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inventory-table__card-title strong {
    font-size: 16px;
    line-height: 1.3;
  }

  .inventory-table__card-title span {
    color: var(--color-text-soft);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .inventory-table__card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .inventory-table__card-grid div {
    min-width: 0;
    display: grid;
    gap: 4px;
    padding: var(--space-2);
    border-radius: var(--radius-2);
    background: var(--color-surface-subtle);
  }

  .inventory-table__card-grid dt {
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .inventory-table__card-grid dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--color-text);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .inventory-table__card-stock {
    min-height: 30px;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .inventory-table__card-actions {
    justify-content: stretch;
  }

  .inventory-table__card-actions :deep(.app-button) {
    flex: 1 1 0;
  }
}
</style>
