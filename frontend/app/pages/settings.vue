<script setup lang="ts">
import { useSettings } from '~/composables/useSettings'
import type { AiClientConfigs, AiProviderId, BusinessSettings } from '~/types/settings'
import type { UpdateAuthPayload } from '~/types/auth'

definePageMeta({
  title: '设置'
})

type AiProviderDraft = {
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  configured: boolean
}

const {
  username,
  usesDefaultPassword
} = useAuth()

const {
  settings,
  loading,
  saving,
  accountSaving,
  error,
  providerOptions,
  loadSettings,
  saveBusinessSettings,
  saveMachines,
  saveCategories,
  saveAiClientConfigs,
  updateAccount
} = useSettings()

const businessDraft = reactive({
  feeRate: '0.006',
  lowStockThreshold: '3',
  restockTargetDays: '7'
})
const machinesDraft = shallowRef('')
const categoriesDraft = shallowRef('')
const aiDraft = reactive<Record<AiProviderId, AiProviderDraft>>({
  opencode: { baseUrl: '', apiKey: '', apiKeyMasked: '', configured: false },
  qwen: { baseUrl: '', apiKey: '', apiKeyMasked: '', configured: false },
  deepseek: { baseUrl: '', apiKey: '', apiKeyMasked: '', configured: false },
  claude: { baseUrl: '', apiKey: '', apiKeyMasked: '', configured: false },
  yunwu: { baseUrl: '', apiKey: '', apiKeyMasked: '', configured: false }
})
const aiProviderRows = computed(() => providerOptions.map(provider => ({
  ...provider,
  draft: aiDraft[provider.id]
})))

function syncDrafts() {
  const business = settings.value.businessSettings
  businessDraft.feeRate = String(business.feeRate)
  businessDraft.lowStockThreshold = String(business.lowStockThreshold)
  businessDraft.restockTargetDays = String(business.restockTargetDays)
  machinesDraft.value = settings.value.machines.join('\n')
  categoriesDraft.value = settings.value.categories.join('\n')

  for (const provider of providerOptions) {
    const config = settings.value.aiClientConfigs[provider.id]
    aiDraft[provider.id] = {
      baseUrl: config?.baseUrl || provider.defaultBaseUrl,
      apiKey: '',
      apiKeyMasked: config?.apiKeyMasked || '',
      configured: !!config?.configured
    }
  }
}

function parseLines(value: string) {
  return Array.from(new Set(
    value
      .split(/\r?\n|,/)
      .map(item => item.trim())
      .filter(Boolean)
  ))
}

async function submitBusinessSettings() {
  const payload: BusinessSettings = {
    feeRate: Number(businessDraft.feeRate),
    lowStockThreshold: Number(businessDraft.lowStockThreshold),
    restockTargetDays: Number(businessDraft.restockTargetDays)
  }
  await saveBusinessSettings(payload)
}

async function submitLists() {
  await Promise.all([
    saveMachines(parseLines(machinesDraft.value)),
    saveCategories(parseLines(categoriesDraft.value))
  ])
}

async function submitAiConfigs() {
  const configs = Object.fromEntries(providerOptions.map(provider => {
    const draft = aiDraft[provider.id]
    return [provider.id, {
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || undefined,
      apiKeyMasked: draft.apiKey.trim() ? undefined : draft.apiKeyMasked
    }]
  })) as AiClientConfigs

  await saveAiClientConfigs(configs)
  for (const provider of providerOptions) {
    aiDraft[provider.id].apiKey = ''
  }
}

async function submitAccount(payload: UpdateAuthPayload) {
  await updateAccount(payload)
}

watch(settings, syncDrafts)

onMounted(async () => {
  await loadSettings()
  syncDrafts()
})
</script>

<template>
  <div class="settings-page">
    <header class="settings-page__header">
      <div>
        <h1 class="settings-page__title">设置</h1>
        <p class="settings-page__description">
          维护账号、售货机、分类、库存阈值和 AI provider 配置。
        </p>
      </div>
      <StatusBadge :label="loading ? '加载中' : '已加载'" :tone="loading ? 'warning' : 'success'" />
    </header>

    <section v-if="error" class="settings-page__error surface-panel" role="alert">
      <div>
        <h2 class="settings-page__error-title">设置加载失败</h2>
        <p class="settings-page__error-message">{{ error.message }}</p>
      </div>
      <AppButton variant="secondary" :loading="loading" @click="loadSettings">
        重试
      </AppButton>
    </section>

    <SettingsSection title="账号安全" description="修改登录账号或密码。">
      <template #aside>
        <StatusBadge
          :label="usesDefaultPassword ? '默认密码' : '已设置密码'"
          :tone="usesDefaultPassword ? 'warning' : 'success'"
        />
      </template>
      <AccountSettingsForm
        :username="username || 'admin'"
        :uses-default-password="usesDefaultPassword"
        :submitting="accountSaving"
        @submit="submitAccount"
      />
    </SettingsSection>

    <SettingsSection title="业务参数" description="用于库存提醒、补货建议和利润计算的基础参数。">
      <form class="settings-page__form" @submit.prevent="submitBusinessSettings">
        <div class="settings-page__grid">
          <AppInput
            v-model="businessDraft.feeRate"
            label="手续费率"
            type="number"
            step="0.0001"
            placeholder="0.006"
          />
          <AppInput
            v-model="businessDraft.lowStockThreshold"
            label="低库存阈值"
            type="number"
            step="1"
            placeholder="3"
          />
          <AppInput
            v-model="businessDraft.restockTargetDays"
            label="补货目标天数"
            type="number"
            step="1"
            placeholder="7"
          />
        </div>
        <div class="settings-page__actions">
          <AppButton type="submit" :loading="saving">
            保存业务参数
          </AppButton>
        </div>
      </form>
    </SettingsSection>

    <SettingsSection title="售货机与分类" description="每行填写一个名称，也可以用逗号分隔。">
      <form class="settings-page__form" @submit.prevent="submitLists">
        <div class="settings-page__grid settings-page__grid--two">
          <label class="settings-page__field">
            <span>售货机</span>
            <textarea v-model="machinesDraft" rows="6" />
          </label>
          <label class="settings-page__field">
            <span>分类</span>
            <textarea v-model="categoriesDraft" rows="6" />
          </label>
        </div>
        <div class="settings-page__actions">
          <AppButton type="submit" :loading="saving">
            保存列表
          </AppButton>
        </div>
      </form>
    </SettingsSection>

    <SettingsSection title="AI provider" description="API Key 仅提交到服务端，页面只显示脱敏状态。">
      <form class="settings-page__form" @submit.prevent="submitAiConfigs">
        <div class="settings-page__providers">
          <article
            v-for="provider in aiProviderRows"
            :key="provider.id"
            class="settings-page__provider"
          >
            <div class="settings-page__provider-heading">
              <div>
                <h3>{{ provider.label }}</h3>
                <p>{{ provider.baseUrlEnv }} / {{ provider.keyEnv }}</p>
              </div>
              <StatusBadge
                :label="provider.draft.configured ? provider.draft.apiKeyMasked || '已配置' : '未配置'"
                :tone="provider.draft.configured ? 'success' : 'neutral'"
              />
            </div>
            <div class="settings-page__grid settings-page__grid--two">
              <AppInput
                v-model="provider.draft.baseUrl"
                label="Base URL"
              />
              <AppInput
                v-model="provider.draft.apiKey"
                label="API Key"
                type="password"
                placeholder="留空则保留原 Key"
              />
            </div>
          </article>
        </div>
        <div class="settings-page__actions">
          <AppButton type="submit" :loading="saving">
            保存 AI 配置
          </AppButton>
        </div>
      </form>
    </SettingsSection>
  </div>
</template>

<style scoped>
.settings-page {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
}

.settings-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.settings-page__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.settings-page__description {
  max-width: 760px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.settings-page__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-color: rgb(194 65 12 / 28%);
  background: var(--color-danger-soft);
}

.settings-page__error-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.settings-page__error-message {
  margin: var(--space-1) 0 0;
  color: var(--color-danger);
  font-weight: 700;
}

.settings-page__form,
.settings-page__providers {
  display: grid;
  gap: var(--space-4);
}

.settings-page__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.settings-page__grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-page__field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.settings-page__field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.settings-page__field textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  line-height: 1.5;
}

.settings-page__provider {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.settings-page__provider-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.settings-page__provider-heading h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
}

.settings-page__provider-heading p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}

.settings-page__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .settings-page {
    gap: var(--space-3);
  }

  .settings-page__header,
  .settings-page__error,
  .settings-page__provider-heading {
    display: grid;
  }

  .settings-page__title {
    font-size: 20px;
  }

  .settings-page__grid,
  .settings-page__grid--two {
    grid-template-columns: 1fr;
  }

  .settings-page__actions {
    justify-content: stretch;
  }

  .settings-page__actions :deep(.app-button) {
    width: 100%;
  }
}
</style>
