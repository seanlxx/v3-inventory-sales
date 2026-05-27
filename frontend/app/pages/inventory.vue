<script setup lang="ts">
import type { CycleCountPayload, InventoryAdjustmentPayload, InventoryBalance, InventoryTransferPayload } from '~/types/inventory'

definePageMeta({
  title: '库存'
})

const {
  balances,
  filteredBalances,
  filters,
  machineOptions,
  categoryOptions,
  selectedBalance,
  movements,
  loading,
  movementsLoading,
  adjusting,
  transferring,
  cycleCounting,
  error,
  movementsError,
  updateFilters,
  loadBalances,
  loadMovements,
  createAdjustment,
  createTransfer,
  createCycleCount
} = useInventory()

const adjustmentOpen = shallowRef(false)
const transferOpen = shallowRef(false)
const cycleCountOpen = shallowRef(false)
const mobileTimelineOpen = shallowRef(false)
const adjustingBalance = shallowRef<InventoryBalance | null>(null)
const transferBalance = shallowRef<InventoryBalance | null>(null)

async function openMovements(balance: InventoryBalance) {
  mobileTimelineOpen.value = true
  await loadMovements(balance)
}

function openAdjustment(balance: InventoryBalance) {
  adjustingBalance.value = balance
  adjustmentOpen.value = true
}

function openTransfer(balance: InventoryBalance) {
  transferBalance.value = balance
  transferOpen.value = true
}

function openCycleCount() {
  cycleCountOpen.value = true
}

async function submitAdjustment(payload: InventoryAdjustmentPayload) {
  await createAdjustment(payload)
  adjustmentOpen.value = false
}

async function submitTransfer(payload: InventoryTransferPayload) {
  await createTransfer(payload)
  transferOpen.value = false
}

async function submitCycleCount(payload: CycleCountPayload) {
  await createCycleCount(payload)
  cycleCountOpen.value = false
}

async function retryMovements() {
  await loadMovements(selectedBalance.value)
}

onMounted(async () => {
  await loadBalances()
  if (filteredBalances.value[0]) {
    await loadMovements(filteredBalances.value[0])
  }
})
</script>

<template>
  <div class="inventory-page">
    <InventoryFilters
      :filters="filters"
      :machines="machineOptions"
      :categories="categoryOptions"
      :result-count="filteredBalances.length"
      :loading="loading"
      @update-filters="updateFilters"
      @refresh="loadBalances"
      @cycle-count="openCycleCount"
    />

    <div class="inventory-page__body">
      <InventoryBalanceTable
        :balances="filteredBalances"
        :loading="loading"
        :error="error"
        @movements="openMovements"
        @adjust="openAdjustment"
        @transfer="openTransfer"
        @retry="loadBalances"
      />

      <StockMovementTimeline
        class="inventory-page__timeline"
        :balance="selectedBalance"
        :movements="movements"
        :loading="movementsLoading"
        :error="movementsError"
        @retry="retryMovements"
      />
    </div>

    <AppDrawer
      v-model:open="mobileTimelineOpen"
      title="库存流水"
      :description="selectedBalance ? `${selectedBalance.productName} · ${selectedBalance.machineId}` : '库存流水'"
    >
      <StockMovementTimeline
        :balance="selectedBalance"
        :movements="movements"
        :loading="movementsLoading"
        :error="movementsError"
        @retry="retryMovements"
      />
    </AppDrawer>

    <StockAdjustmentDialog
      v-model:open="adjustmentOpen"
      :balance="adjustingBalance"
      :submitting="adjusting"
      @submit="submitAdjustment"
    />

    <TransferDialog
      v-model:open="transferOpen"
      :balance="transferBalance"
      :machines="machineOptions"
      :submitting="transferring"
      @submit="submitTransfer"
    />

    <CycleCountDialog
      v-model:open="cycleCountOpen"
      :balances="balances"
      :machines="machineOptions"
      :initial-machine-id="filters.machineId"
      :submitting="cycleCounting"
      @submit="submitCycleCount"
    />
  </div>
</template>

<style scoped>
.inventory-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.inventory-page__body {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: var(--space-4);
  align-items: start;
}

.inventory-page__timeline {
  position: sticky;
  top: var(--space-4);
}

@media (max-width: 1180px) {
  .inventory-page__body {
    grid-template-columns: 1fr;
  }

  .inventory-page__timeline {
    display: none;
  }
}

@media (max-width: 760px) {
  .inventory-page {
    gap: var(--space-3);
  }
}
</style>
