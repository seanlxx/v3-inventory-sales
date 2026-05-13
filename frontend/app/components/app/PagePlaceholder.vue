<script setup lang="ts">
type Props = {
  title: string
  description: string
  sections?: readonly string[]
}

const props = withDefaults(defineProps<Props>(), {
  sections: () => []
})

const dialogOpen = shallowRef(false)
const drawerOpen = shallowRef(false)
const sampleInput = shallowRef('')
const { status, errorMessage, isAuthenticated, username, fetchProfile, logout } = useAuth()
const mounted = shallowRef(false)
const authReady = computed(() => mounted.value && isAuthenticated.value)

const tableColumns = [
  { key: 'name', label: '组件' },
  { key: 'status', label: '状态' },
  { key: 'updatedAt', label: '更新时间', align: 'right' }
] as const

const tableRows = [
  { name: 'AppShell', status: '已占位', updatedAt: '本阶段' },
  { name: 'DataTable', status: '占位中', updatedAt: '本阶段' },
  { name: 'StatusBadge', status: '可复用', updatedAt: '本阶段' }
] as const

async function checkAuthProfile() {
  await fetchProfile().catch(() => null)
}

onMounted(() => {
  mounted.value = true
})
</script>

<template>
  <section class="page-placeholder">
    <header class="page-placeholder__header">
      <div class="page-placeholder__heading">
        <p class="page-placeholder__stage">经营控制台</p>
        <h2 class="page-placeholder__title">{{ props.title }}</h2>
        <p class="page-placeholder__description">{{ props.description }}</p>
      </div>

      <div class="page-placeholder__actions" aria-label="基础操作占位">
        <AppButton variant="primary" @click="dialogOpen = true">
          打开弹窗
        </AppButton>
        <AppButton variant="secondary" @click="drawerOpen = true">
          打开抽屉
        </AppButton>
      </div>
    </header>

    <div class="page-placeholder__grid">
      <section class="page-placeholder__panel">
        <div class="page-placeholder__panel-header">
          <h3 class="page-placeholder__panel-title">控件状态</h3>
          <StatusBadge label="占位" tone="info" />
        </div>
        <div class="page-placeholder__control-stack">
          <AppInput
            v-model="sampleInput"
            label="输入框"
            placeholder="基础控件占位"
            hint="当前不接业务 API"
          />
          <div class="page-placeholder__button-row">
            <AppButton>主操作</AppButton>
            <AppButton variant="secondary">次操作</AppButton>
            <AppButton variant="danger">危险操作</AppButton>
          </div>
          <div class="page-placeholder__badge-row">
            <StatusBadge label="正常" tone="success" />
            <StatusBadge label="待处理" tone="warning" />
            <StatusBadge label="异常" tone="danger" />
          </div>
        </div>
      </section>

      <section class="page-placeholder__panel">
        <div class="page-placeholder__panel-header">
          <h3 class="page-placeholder__panel-title">登录态联调</h3>
          <StatusBadge
            :label="authReady ? username || '已登录' : '未登录'"
            :tone="authReady ? 'success' : 'neutral'"
          />
        </div>
        <div class="page-placeholder__section-list">
          <div class="page-placeholder__auth-actions">
            <AppButton variant="secondary" :loading="status === 'pending'" @click="checkAuthProfile">
              检查登录态
            </AppButton>
            <AppButton variant="ghost" @click="logout">
              清除会话
            </AppButton>
          </div>
          <p v-if="errorMessage" class="page-placeholder__error">
            {{ errorMessage }}
          </p>
          <div
            v-for="section in props.sections"
            :key="section"
            class="page-placeholder__row"
          >
            <span class="page-placeholder__row-dot" aria-hidden="true" />
            <span>{{ section }}</span>
          </div>
        </div>
      </section>
    </div>

    <DataTable :columns="tableColumns" :rows="tableRows" />

    <AppDialog
      v-model:open="dialogOpen"
      title="AppDialog 占位"
      description="这里只验证基础弹窗结构和响应式尺寸。"
    >
      <p class="page-placeholder__overlay-copy">
        后续业务表单会复用这个壳层，但本阶段不写具体业务流程。
      </p>
      <template #footer>
        <AppButton variant="secondary" @click="dialogOpen = false">
          关闭
        </AppButton>
      </template>
    </AppDialog>

    <AppDrawer
      v-model:open="drawerOpen"
      title="AppDrawer 占位"
      description="这里用于验证桌面右抽屉和移动端底部抽屉。"
    >
      <p class="page-placeholder__overlay-copy">
        抽屉只承载基础布局，暂不接商品、库存或单据数据。
      </p>
    </AppDrawer>
  </section>
</template>

<style scoped>
.page-placeholder {
  min-width: 0;
  display: grid;
  gap: var(--space-5);
}

.page-placeholder__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.page-placeholder__heading {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
}

.page-placeholder__stage {
  margin: 0;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 800;
}

.page-placeholder__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.page-placeholder__description {
  max-width: 720px;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.page-placeholder__actions,
.page-placeholder__button-row,
.page-placeholder__badge-row,
.page-placeholder__auth-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.page-placeholder__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.page-placeholder__panel {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  align-content: start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-4);
  background: var(--color-surface);
}

.page-placeholder__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.page-placeholder__panel-title {
  margin: 0;
  font-size: 16px;
}

.page-placeholder__control-stack,
.page-placeholder__section-list {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.page-placeholder__row {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface-subtle);
  color: var(--color-text);
}

.page-placeholder__row-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--color-info);
}

.page-placeholder__error {
  margin: 0;
  border: 1px solid rgb(194 65 12 / 28%);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  line-height: 1.6;
}

.page-placeholder__overlay-copy {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 860px) {
  .page-placeholder__header {
    align-items: stretch;
    flex-direction: column;
  }

  .page-placeholder__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .page-placeholder__title {
    font-size: 21px;
  }
}
</style>
