<script setup lang="ts">
import { useVendorSync } from '~/composables/useVendorSync'
import type { VendorSyncPayload, VendorSyncRun, VendorSyncScope, VendorSyncSummary } from '~/types/vendorSync'
import { formatDateTime, formatQuantity } from '~/utils/format'

const {
  status,
  latestRun,
  loading,
  syncing,
  error,
  loadStatus,
  sync
} = useVendorSync()

const today = new Date().toISOString().slice(0, 10)
const form = reactive({
  startDate: today,
  endDate: today,
  includeInventory: true,
  includeSales: true
})
const formError = shallowRef('')

const credentialsTone = computed(() => status.value.credentials.configured ? 'success' : 'warning')
const credentialsLabel = computed(() => status.value.credentials.configured ? '已配置' : '未配置')
const runTone = computed(() => {
  if (!latestRun.value) return 'neutral'
  if (latestRun.value.status === 'success') return 'success'
  if (latestRun.value.status === 'failed') return 'danger'
  return 'warning'
})
const runLabel = computed(() => {
  if (!latestRun.value) return '暂无同步'
  if (latestRun.value.status === 'success') return latestRun.value.dryRun ? '预览成功' : '同步成功'
  if (latestRun.value.status === 'failed') return '同步失败'
  return '同步中'
})

function selectedScope(): VendorSyncScope[] {
  const scope: VendorSyncScope[] = []
  if (form.includeInventory) scope.push('inventory')
  if (form.includeSales) scope.push('sales')
  return scope
}

function validateForm() {
  formError.value = ''
  const start = new Date(`${form.startDate}T00:00:00Z`).getTime()
  const end = new Date(`${form.endDate}T00:00:00Z`).getTime()
  if (!form.startDate || !form.endDate || Number.isNaN(start) || Number.isNaN(end)) {
    formError.value = '请选择有效日期范围'
    return false
  }
  if (end < start) {
    formError.value = '结束日期不能早于开始日期'
    return false
  }
  if ((end - start) / 86400000 > 30) {
    formError.value = '日期范围最多 31 天'
    return false
  }
  if (selectedScope().length === 0) {
    formError.value = '请至少选择一个同步内容'
    return false
  }
  return true
}

async function submit(dryRun: boolean) {
  if (!validateForm()) return
  const payload: VendorSyncPayload = {
    startDate: form.startDate,
    endDate: form.endDate,
    dryRun,
    scope: selectedScope()
  }
  await sync(payload)
}

function summaryEntries(summary: VendorSyncSummary | null) {
  if (!summary) return []
  return [
    ['销售导入', summary.salesImported],
    ['重复销售', summary.salesDuplicate],
    ['跳过销售', summary.salesSkipped],
    ['商品新建', summary.productsCreated],
    ['售价更新', summary.pricesUpdated],
    ['成本更新', summary.costsUpdated],
    ['库存校准', summary.inventoryAdjusted],
    ['警告', summary.warnings]
  ] as const
}

function runTime(run: VendorSyncRun | null) {
  if (!run) return '-'
  return formatDateTime(new Date(run.finishedAt || run.startedAt).toISOString())
}

onMounted(async () => {
  await loadStatus()
})
</script>

<template>
  <SettingsSection title="三号机厂商同步" description="从盛码读取三号机销售、库存、售价和成本。">
    <template #aside>
      <StatusBadge :label="credentialsLabel" :tone="credentialsTone" />
    </template>

    <div class="vendor-sync">
      <section class="vendor-sync__meta">
        <div>
          <span>设备编号</span>
          <strong>{{ status.mapping.vendorDeviceCode }}</strong>
        </div>
        <div>
          <span>内部 id</span>
          <strong>{{ status.mapping.vendorMachineId }}</strong>
        </div>
        <div>
          <span>本地机器</span>
          <strong>{{ status.mapping.localMachineName }}</strong>
        </div>
        <div>
          <span>最近同步</span>
          <strong>{{ runTime(latestRun) }}</strong>
        </div>
      </section>

      <section class="vendor-sync__run">
        <StatusBadge :label="runLabel" :tone="runTone" />
        <p v-if="latestRun?.errorMessage" class="vendor-sync__error">
          {{ latestRun.errorMessage }}
        </p>
        <p v-else-if="error" class="vendor-sync__error">
          {{ error.message }}
        </p>
      </section>

      <form class="vendor-sync__form" @submit.prevent="submit(true)">
        <div class="vendor-sync__grid">
          <AppInput v-model="form.startDate" label="开始日期" type="date" />
          <AppInput v-model="form.endDate" label="结束日期" type="date" />
          <div class="vendor-sync__checks">
            <label>
              <input v-model="form.includeInventory" type="checkbox">
              <span>库存/售价/成本</span>
            </label>
            <label>
              <input v-model="form.includeSales" type="checkbox">
              <span>销售</span>
            </label>
          </div>
        </div>

        <p v-if="formError" class="vendor-sync__error">
          {{ formError }}
        </p>

        <div class="vendor-sync__actions">
          <AppButton type="button" variant="secondary" :loading="loading" @click="loadStatus">
            刷新状态
          </AppButton>
          <AppButton type="submit" variant="secondary" :loading="syncing">
            预览同步
          </AppButton>
          <AppButton type="button" :loading="syncing" @click="submit(false)">
            确认同步
          </AppButton>
        </div>
      </form>

      <section v-if="latestRun?.summary" class="vendor-sync__summary">
        <div
          v-for="[label, value] in summaryEntries(latestRun.summary)"
          :key="label"
          class="vendor-sync__summary-item"
        >
          <span>{{ label }}</span>
          <strong>{{ formatQuantity(value) }}</strong>
        </div>
      </section>

      <details v-if="latestRun?.warnings?.length" class="vendor-sync__warnings">
        <summary>警告明细（{{ latestRun.warnings.length }}）</summary>
        <ul>
          <li v-for="warning in latestRun.warnings" :key="warning">
            {{ warning }}
          </li>
        </ul>
      </details>
    </div>
  </SettingsSection>
</template>

<style scoped>
.vendor-sync {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.vendor-sync__meta,
.vendor-sync__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.vendor-sync__meta div,
.vendor-sync__summary-item {
  min-width: 0;
  display: grid;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.vendor-sync__meta span,
.vendor-sync__summary-item span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.vendor-sync__meta strong,
.vendor-sync__summary-item strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.vendor-sync__run {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.vendor-sync__form {
  display: grid;
  gap: var(--space-3);
}

.vendor-sync__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: end;
}

.vendor-sync__checks {
  min-height: var(--control-height);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.vendor-sync__checks label {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.vendor-sync__checks input {
  width: 18px;
  height: 18px;
}

.vendor-sync__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.vendor-sync__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 700;
}

.vendor-sync__warnings {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface-subtle);
}

.vendor-sync__warnings summary {
  cursor: pointer;
  font-weight: 800;
}

.vendor-sync__warnings ul {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding-left: var(--space-4);
  color: var(--color-text-muted);
  line-height: 1.6;
}

@media (max-width: 900px) {
  .vendor-sync__meta,
  .vendor-sync__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vendor-sync__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .vendor-sync {
    gap: var(--space-3);
  }

  .vendor-sync__meta,
  .vendor-sync__summary {
    grid-template-columns: 1fr;
  }

  .vendor-sync__actions {
    display: grid;
    justify-content: stretch;
  }

  .vendor-sync__actions :deep(.app-button) {
    width: 100%;
  }
}
</style>
