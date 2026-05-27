<script setup lang="ts">
import type { CycleCountPayload, InventoryBalance } from '~/types/inventory'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  balances: readonly InventoryBalance[]
  machines: readonly string[]
  initialMachineId?: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: CycleCountPayload]
}>()

const machineId = shallowRef('')
const reason = shallowRef('')
const quantities = reactive<Record<string, string>>({})
const formError = shallowRef('')

const machineBalances = computed(() =>
  props.balances
    .filter(balance => balance.machineId === machineId.value)
    .sort((left, right) => left.productName.localeCompare(right.productName, 'zh-CN'))
)

const changedItems = computed(() =>
  machineBalances.value
    .map(balance => {
      const raw = quantities[balance.productId]
      if (raw === undefined || raw === '') return null
      const observedQty = Math.round(Number(raw))
      if (!Number.isFinite(observedQty) || observedQty < 0) return null
      if (observedQty === Number(balance.quantityOnHand || 0)) return null
      return {
        productId: balance.productId,
        observedQty
      }
    })
    .filter(Boolean) as CycleCountPayload['items']
)

const observedItems = computed(() =>
  machineBalances.value.map(balance => ({
    productId: balance.productId,
    observedQty: Math.round(Number(quantities[balance.productId]) || 0)
  }))
)

watch(() => [open.value, props.initialMachineId, props.machines.join('|')], () => {
  if (!open.value) return
  machineId.value = props.initialMachineId && props.initialMachineId !== 'all'
    ? props.initialMachineId
    : props.machines[0] || ''
  reason.value = ''
  formError.value = ''
}, { immediate: true })

watch(machineBalances, balances => {
  for (const key of Object.keys(quantities)) {
    delete quantities[key]
  }
  for (const balance of balances) {
    quantities[balance.productId] = String(balance.quantityOnHand)
  }
}, { immediate: true })

function submitCycleCount() {
  if (!machineId.value) {
    formError.value = '请选择盘点机台'
    return
  }
  const invalid = machineBalances.value.find(balance => {
    const value = Number(quantities[balance.productId])
    return !Number.isFinite(value) || value < 0
  })
  if (invalid) {
    formError.value = `${invalid.productName} 的实盘数量无效`
    return
  }
  const cleanReason = reason.value.trim()
  if (!cleanReason) {
    formError.value = '请填写盘点原因'
    return
  }

  formError.value = ''
  emit('submit', {
    machineId: machineId.value,
    reason: cleanReason,
    items: observedItems.value
  })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="现场盘点"
    :description="machineId ? `${machineId} · ${formatQuantity(machineBalances.length)} 个商品` : '现场盘点'"
    size="wide"
  >
    <form class="cycle-count" @submit.prevent="submitCycleCount">
      <div class="cycle-count__toolbar">
        <label class="cycle-count__field">
          <span class="cycle-count__label">盘点机台</span>
          <select v-model="machineId" class="cycle-count__select">
            <option v-for="machine in props.machines" :key="machine" :value="machine">
              {{ machine }}
            </option>
          </select>
        </label>
        <AppInput
          v-model="reason"
          label="原因"
          placeholder="例如：月底盘点、补货后复核"
        />
      </div>

      <p v-if="formError" class="cycle-count__error">
        {{ formError }}
      </p>

      <div class="cycle-count__list" aria-label="盘点商品">
        <div v-if="machineBalances.length === 0" class="cycle-count__state">
          当前机台没有库存余额
        </div>
        <div v-for="balance in machineBalances" v-else :key="balance.productId" class="cycle-count__row">
          <div class="cycle-count__product">
            <strong :title="balance.productName">{{ balance.productName }}</strong>
            <span>{{ balance.category || '其他' }} · 成本 {{ formatMoney(Number(balance.purchaseAvgCost) || Number(balance.avgCost) || 0) }}</span>
          </div>
          <div class="cycle-count__current">
            <span>账面</span>
            <strong>{{ formatQuantity(balance.quantityOnHand) }}</strong>
          </div>
          <label class="cycle-count__qty">
            <span>实盘</span>
            <input v-model="quantities[balance.productId]" type="number" min="0">
          </label>
        </div>
      </div>

      <div class="cycle-count__actions">
        <StatusBadge :label="`差异 ${formatQuantity(changedItems.length)} 项`" :tone="changedItems.length > 0 ? 'warning' : 'success'" />
        <div class="cycle-count__buttons">
          <AppButton type="button" variant="secondary" @click="open = false">
            取消
          </AppButton>
          <AppButton type="submit" :loading="props.submitting" :disabled="!machineId || machineBalances.length === 0">
            提交盘点
          </AppButton>
        </div>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.cycle-count {
  display: grid;
  gap: var(--space-4);
}

.cycle-count__toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 0.6fr) minmax(220px, 1fr);
  gap: var(--space-3);
}

.cycle-count__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.cycle-count__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.cycle-count__select,
.cycle-count__qty input {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.cycle-count__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.cycle-count__list {
  max-height: min(440px, 52vh);
  display: grid;
  gap: var(--space-2);
  overflow: auto;
  padding-right: 2px;
}

.cycle-count__state,
.cycle-count__row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.cycle-count__state {
  min-height: 120px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.cycle-count__row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 120px;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
}

.cycle-count__product {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.cycle-count__product strong,
.cycle-count__product span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cycle-count__product span,
.cycle-count__current span,
.cycle-count__qty span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.cycle-count__current,
.cycle-count__qty {
  display: grid;
  gap: 6px;
}

.cycle-count__current strong {
  font-variant-numeric: tabular-nums;
}

.cycle-count__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.cycle-count__buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .cycle-count__toolbar,
  .cycle-count__row {
    grid-template-columns: 1fr;
  }

  .cycle-count__select,
  .cycle-count__qty input {
    min-height: var(--control-height-mobile);
  }

  .cycle-count__actions,
  .cycle-count__buttons {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
