<script setup lang="ts">
import { useOrderImport } from '~/composables/useOrderImport'
import { formatQuantity } from '~/utils/format'

const {
  fileSummary,
  previewSummary,
  result,
  warnings,
  parsing,
  previewing,
  importing,
  error,
  selectFile,
  importOrders
} = useOrderImport()

const fileInput = shallowRef<HTMLInputElement | null>(null)
const busy = computed(() => parsing.value || previewing.value)
const canImport = computed(() => (
  Boolean(previewSummary.value?.ordersReady)
  && !result.value
  && !busy.value
  && !importing.value
))
const badgeTone = computed(() => {
  if (error.value) return 'danger'
  if (result.value) return 'success'
  if (busy.value || importing.value) return 'warning'
  if (previewSummary.value) return previewSummary.value.ordersReady > 0 ? 'warning' : 'success'
  return 'neutral'
})
const badgeLabel = computed(() => {
  if (error.value) return '需要检查'
  if (result.value) return '导入完成'
  if (parsing.value) return '正在解析'
  if (previewing.value) return '正在查重'
  if (importing.value) return '正在导入'
  if (previewSummary.value) {
    return previewSummary.value.ordersReady > 0
      ? `待补充 ${previewSummary.value.ordersReady} 单`
      : '没有新订单'
  }
  return '未选择文件'
})

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await selectFile(file)
}
</script>

<template>
  <SettingsSection
    title="订单明细补充导入"
    description="上传订单明细 Excel，系统按订单号合并续行商品，并只补充数据库中不存在的已完成订单。"
  >
    <template #aside>
      <StatusBadge :label="badgeLabel" :tone="badgeTone" />
    </template>

    <div class="order-import">
      <input
        ref="fileInput"
        class="order-import__file-input"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFileChange"
      >

      <section class="order-import__picker">
        <div>
          <strong>{{ fileSummary?.fileName || '选择“订单明细”Excel 文件' }}</strong>
          <p v-if="fileSummary">
            工作表：{{ fileSummary.sheetName }} · 日期：{{ fileSummary.startDate || '-' }} 至 {{ fileSummary.endDate || '-' }}
          </p>
          <p v-else>
            支持续行商品明细；取消、进行中、退款订单会自动跳过。
          </p>
        </div>
        <AppButton type="button" variant="secondary" :loading="busy" @click="openFilePicker">
          {{ fileSummary ? '重新选择' : '选择 Excel' }}
        </AppButton>
      </section>

      <p v-if="error" class="order-import__error" role="alert">
        {{ error }}
      </p>

      <section v-if="fileSummary" class="order-import__summary" aria-label="文件解析结果">
        <div>
          <span>文件订单</span>
          <strong>{{ formatQuantity(fileSummary.totalOrders) }}</strong>
        </div>
        <div>
          <span>已完成订单</span>
          <strong>{{ formatQuantity(fileSummary.completedOrders) }}</strong>
        </div>
        <div>
          <span>商品明细</span>
          <strong>{{ formatQuantity(fileSummary.itemRows) }}</strong>
        </div>
        <div>
          <span>文件内跳过</span>
          <strong>{{ formatQuantity(fileSummary.skippedOrders) }}</strong>
        </div>
      </section>

      <section v-if="previewSummary" class="order-import__preview">
        <div class="order-import__preview-heading">
          <div>
            <span>数据库查重结果</span>
            <strong>确认后只写入待补充订单</strong>
          </div>
          <StatusBadge
            :label="previewSummary.ordersReady > 0 ? '可以导入' : '无需导入'"
            :tone="previewSummary.ordersReady > 0 ? 'warning' : 'success'"
          />
        </div>
        <div class="order-import__summary">
          <div>
            <span>待补充订单</span>
            <strong>{{ formatQuantity(previewSummary.ordersReady) }}</strong>
          </div>
          <div>
            <span>重复订单</span>
            <strong>{{ formatQuantity(previewSummary.ordersDuplicate) }}</strong>
          </div>
          <div>
            <span>预计新商品</span>
            <strong>{{ formatQuantity(previewSummary.productsCreated) }}</strong>
          </div>
          <div>
            <span>待写商品明细</span>
            <strong>{{ formatQuantity(previewSummary.itemsReady) }}</strong>
          </div>
        </div>
      </section>

      <section v-if="result" class="order-import__result" role="status">
        <strong>订单补充完成</strong>
        <p>
          新增 {{ result.summary.ordersImported }} 个订单、{{ result.summary.itemsImported }} 条商品明细；
          跳过 {{ result.summary.ordersDuplicate }} 个重复订单。
        </p>
      </section>

      <ul v-if="warnings.length" class="order-import__warnings">
        <li v-for="warning in warnings.slice(0, 5)" :key="warning">
          {{ warning }}
        </li>
        <li v-if="warnings.length > 5">
          另有 {{ warnings.length - 5 }} 条提示未展开。
        </li>
      </ul>

      <div class="order-import__actions">
        <span v-if="previewSummary?.missingCostItems" class="order-import__cost-note">
          {{ previewSummary.missingCostItems }} 条明细未找到历史成本，将按 0 记录并进入成本缺口。
        </span>
        <AppButton
          type="button"
          :loading="importing"
          :disabled="!canImport"
          @click="importOrders"
        >
          {{ result ? '已完成导入' : '确认补充新订单' }}
        </AppButton>
      </div>
    </div>
  </SettingsSection>
</template>

<style scoped>
.order-import {
  display: grid;
  gap: var(--space-4);
}

.order-import__file-input {
  display: none;
}

.order-import__picker {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.order-import__picker > div {
  min-width: 0;
}

.order-import__picker strong {
  display: block;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.order-import__picker p,
.order-import__result p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.order-import__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.order-import__summary > div {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.order-import__summary span,
.order-import__preview-heading span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.order-import__summary strong {
  color: var(--color-text);
  font-size: 18px;
}

.order-import__preview {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.order-import__preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.order-import__preview-heading > div {
  display: grid;
  gap: 3px;
}

.order-import__result {
  padding: var(--space-3);
  border: 1px solid rgb(22 163 74 / 30%);
  border-radius: var(--radius-2);
  background: rgb(22 163 74 / 8%);
}

.order-import__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
  font-weight: 700;
}

.order-import__warnings {
  margin: 0;
  padding-left: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.order-import__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.order-import__cost-note {
  margin-right: auto;
  color: var(--color-warning);
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 900px) {
  .order-import__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .order-import {
    gap: var(--space-3);
  }

  .order-import__picker,
  .order-import__preview-heading,
  .order-import__actions {
    display: grid;
    align-items: stretch;
  }

  .order-import__actions {
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
  }

  .order-import__summary {
    grid-template-columns: 1fr;
  }

  .order-import__picker :deep(.app-button),
  .order-import__actions :deep(.app-button) {
    width: 100%;
  }
}
</style>