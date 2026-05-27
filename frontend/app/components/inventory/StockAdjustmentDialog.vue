<script setup lang="ts">
import type { InventoryAdjustmentPayload, InventoryBalance } from '~/types/inventory'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  balance?: InventoryBalance | null
  balances: readonly InventoryBalance[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: InventoryAdjustmentPayload]
}>()

const targetQuantity = shallowRef('')
const machineId = shallowRef('')
const note = shallowRef('')
const formError = shallowRef('')

const machineBalances = computed(() =>
  props.balances
    .filter(balance => balance.productId === props.balance?.productId)
    .sort((left, right) => left.machineId.localeCompare(right.machineId, 'zh-CN'))
)

const selectedMachineBalance = computed(() =>
  machineBalances.value.find(balance => balance.machineId === machineId.value) || null
)

watch(() => [props.balance?.productId, machineBalances.value.map(balance => balance.machineId).join('|')], () => {
  machineId.value = machineBalances.value[0]?.machineId || ''
  targetQuantity.value = selectedMachineBalance.value ? String(selectedMachineBalance.value.quantityOnHand) : ''
  note.value = ''
  formError.value = ''
}, { immediate: true })

watch(selectedMachineBalance, balance => {
  targetQuantity.value = balance ? String(balance.quantityOnHand) : ''
})

const displayCost = computed(() =>
  Number(selectedMachineBalance.value?.purchaseAvgCost)
  || Number(selectedMachineBalance.value?.avgCost)
  || Number(props.balance?.purchaseAvgCost)
  || Number(props.balance?.avgCost)
  || 0
)

function submitAdjustment() {
  if (!props.balance) return
  if (!selectedMachineBalance.value) {
    formError.value = '请选择盘点机台'
    return
  }
  const nextQuantity = Number(targetQuantity.value)
  if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
    formError.value = '目标库存必须是不小于 0 的数字'
    return
  }

  const payload: InventoryAdjustmentPayload = {
    productId: props.balance.productId,
    machineId: selectedMachineBalance.value.stockMachineId || selectedMachineBalance.value.machineId,
    quantityOnHand: nextQuantity,
    note: note.value.trim()
  }

  formError.value = ''
  emit('submit', payload)
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="盘点调整"
    :description="props.balance ? `${props.balance.productName} · 调整会提交到后端 adjustment API` : '盘点调整'"
  >
    <form class="stock-adjustment" @submit.prevent="submitAdjustment">
      <div v-if="props.balance" class="stock-adjustment__summary">
        <div>
          <span>总库存</span>
          <strong>{{ formatQuantity(props.balance.quantityOnHand) }} 件</strong>
        </div>
        <div>
          <span>机台账面</span>
          <strong>{{ selectedMachineBalance ? `${formatQuantity(selectedMachineBalance.quantityOnHand)} 件` : '—' }}</strong>
        </div>
        <div>
          <span>进货价</span>
          <strong>{{ displayCost > 0 ? formatMoney(displayCost) : '—' }}</strong>
        </div>
      </div>

      <label class="stock-adjustment__field">
        <span class="stock-adjustment__label">盘点机台</span>
        <select v-model="machineId" class="stock-adjustment__select">
          <option v-for="machineBalance in machineBalances" :key="machineBalance.machineId" :value="machineBalance.machineId">
            {{ machineBalance.machineId }}（{{ formatQuantity(machineBalance.quantityOnHand) }} 件）
          </option>
        </select>
      </label>

      <AppInput
        v-model="targetQuantity"
        label="目标库存"
        type="number"
        placeholder="输入盘点后的实际数量"
        hint="前端只提交目标数量，差值由后端写入 stock_movements。"
        :error="formError"
      />
      <AppInput
        v-model="note"
        label="备注"
        placeholder="可选"
      />

      <p class="stock-adjustment__notice">
        库存余额不可在浏览器直接修改；本入口只调用 `/api/inventory/adjustments`。
      </p>

      <div class="stock-adjustment__actions">
        <AppButton type="button" variant="secondary" @click="open = false">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.submitting" :disabled="!props.balance || !selectedMachineBalance">
          提交盘点
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.stock-adjustment {
  display: grid;
  gap: var(--space-4);
}

.stock-adjustment__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.stock-adjustment__summary div {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.stock-adjustment__summary span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.stock-adjustment__summary strong {
  font-variant-numeric: tabular-nums;
}

.stock-adjustment__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.stock-adjustment__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.stock-adjustment__select {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}

.stock-adjustment__notice {
  margin: 0;
  border: 1px solid rgb(15 118 110 / 26%);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-info-soft);
  color: var(--color-info);
  line-height: 1.6;
}

.stock-adjustment__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .stock-adjustment__summary {
    grid-template-columns: 1fr;
  }

  .stock-adjustment__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .stock-adjustment__select {
    min-height: var(--control-height-mobile);
  }
}
</style>
