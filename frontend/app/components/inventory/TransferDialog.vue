<script setup lang="ts">
import type { InventoryBalance, InventoryTransferPayload } from '~/types/inventory'
import { formatMoney, formatQuantity } from '~/utils/format'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  balance?: InventoryBalance | null
  machines: readonly string[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: InventoryTransferPayload]
}>()

const toMachineId = shallowRef('')
const quantity = shallowRef('')
const reason = shallowRef('')
const formError = shallowRef('')

const targetMachines = computed(() =>
  props.machines.filter(machine => machine && machine !== props.balance?.machineId)
)

const displayCost = computed(() =>
  Number(props.balance?.purchaseAvgCost) || Number(props.balance?.avgCost) || 0
)

watch(() => [props.balance?.productId, props.balance?.machineId, props.machines.join('|')], () => {
  toMachineId.value = targetMachines.value[0] || ''
  quantity.value = ''
  reason.value = ''
  formError.value = ''
}, { immediate: true })

function submitTransfer() {
  if (!props.balance) return
  const qty = Number(quantity.value)
  if (!Number.isFinite(qty) || qty <= 0) {
    formError.value = '调拨数量必须大于 0'
    return
  }
  if (qty > Number(props.balance.quantityOnHand || 0)) {
    formError.value = `当前可调拨 ${formatQuantity(props.balance.quantityOnHand)} 件`
    return
  }
  if (!toMachineId.value || toMachineId.value === props.balance.machineId) {
    formError.value = '请选择不同的调入机台'
    return
  }
  const cleanReason = reason.value.trim()
  if (!cleanReason) {
    formError.value = '请填写调拨原因'
    return
  }

  formError.value = ''
  emit('submit', {
    productId: props.balance.productId,
    fromMachineId: props.balance.stockMachineId || props.balance.machineId,
    toMachineId: toMachineId.value,
    quantity: Math.round(qty),
    reason: cleanReason
  })
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="机间调拨"
    :description="props.balance ? `${props.balance.productName} · ${props.balance.machineId}` : '机间调拨'"
  >
    <form class="transfer-dialog" @submit.prevent="submitTransfer">
      <div v-if="props.balance" class="transfer-dialog__summary">
        <div>
          <span>调出机台</span>
          <strong>{{ props.balance.machineId }}</strong>
        </div>
        <div>
          <span>当前库存</span>
          <strong>{{ formatQuantity(props.balance.quantityOnHand) }} 件</strong>
        </div>
        <div>
          <span>成本</span>
          <strong>{{ displayCost > 0 ? formatMoney(displayCost) : '—' }}</strong>
        </div>
      </div>

      <label class="transfer-dialog__field">
        <span class="transfer-dialog__label">调入机台</span>
        <select v-model="toMachineId" class="transfer-dialog__select">
          <option v-for="machine in targetMachines" :key="machine" :value="machine">
            {{ machine }}
          </option>
        </select>
      </label>

      <AppInput
        v-model="quantity"
        label="调拨数量"
        type="number"
        placeholder="输入调拨件数"
        :error="formError"
      />

      <label class="transfer-dialog__field">
        <span class="transfer-dialog__label">原因</span>
        <textarea
          v-model="reason"
          class="transfer-dialog__textarea"
          rows="3"
          placeholder="例如：现场补货、错放更正"
        />
      </label>

      <div class="transfer-dialog__actions">
        <AppButton type="button" variant="secondary" @click="open = false">
          取消
        </AppButton>
        <AppButton type="submit" :loading="props.submitting" :disabled="!props.balance || targetMachines.length === 0">
          提交调拨
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.transfer-dialog {
  display: grid;
  gap: var(--space-4);
}

.transfer-dialog__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.transfer-dialog__summary div {
  display: grid;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.transfer-dialog__summary span,
.transfer-dialog__label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.transfer-dialog__summary strong {
  font-variant-numeric: tabular-nums;
}

.transfer-dialog__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.transfer-dialog__select,
.transfer-dialog__textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.transfer-dialog__select {
  min-height: var(--control-height);
  padding: 0 var(--space-3);
}

.transfer-dialog__textarea {
  resize: vertical;
  padding: var(--space-3);
  line-height: 1.6;
}

.transfer-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .transfer-dialog__summary {
    grid-template-columns: 1fr;
  }

  .transfer-dialog__select {
    min-height: var(--control-height-mobile);
  }

  .transfer-dialog__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
