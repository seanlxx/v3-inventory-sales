<script setup lang="ts">
import { useSettings } from '~/composables/useSettings'
import { useTheme } from '~/composables/useTheme'
import type { AiClientConfigs, AiProviderId, BusinessSettings } from '~/types/settings'
import type { UpdateAuthPayload } from '~/types/auth'

definePageMeta({
  title: '设置'
})

const { theme, setTheme } = useTheme()

type AiProviderDraft = {
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  modelId: string
  models: string[]
  modelLoading: boolean
  modelError: string
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
  saveAiClientSettings,
  fetchAiModels,
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
  opencode: { baseUrl: '', apiKey: '', apiKeyMasked: '', modelId: '', models: [], modelLoading: false, modelError: '', configured: false },
  qwen: { baseUrl: '', apiKey: '', apiKeyMasked: '', modelId: '', models: [], modelLoading: false, modelError: '', configured: false },
  deepseek: { baseUrl: '', apiKey: '', apiKeyMasked: '', modelId: '', models: [], modelLoading: false, modelError: '', configured: false },
  claude: { baseUrl: '', apiKey: '', apiKeyMasked: '', modelId: '', models: [], modelLoading: false, modelError: '', configured: false },
  yunwu: { baseUrl: '', apiKey: '', apiKeyMasked: '', modelId: '', models: [], modelLoading: false, modelError: '', configured: false }
})
const activeAiProvider = shallowRef<AiProviderId>('qwen')
const activeAiDraft = computed(() => aiDraft[activeAiProvider.value])
const activeAiProviderOption = computed(() =>
  providerOptions.find(provider => provider.id === activeAiProvider.value) ?? providerOptions[0]!
)
const activeAiModelOptions = computed(() => {
  const draft = activeAiDraft.value
  return Array.from(new Set([
    draft.modelId,
    ...draft.models
  ].map(model => model.trim()).filter(Boolean)))
})

function syncDrafts() {
  const business = settings.value.businessSettings
  businessDraft.feeRate = String(business.feeRate)
  businessDraft.lowStockThreshold = String(business.lowStockThreshold)
  businessDraft.restockTargetDays = String(business.restockTargetDays)
  machinesDraft.value = settings.value.machines.join('\n')
  categoriesDraft.value = settings.value.categories.join('\n')
  activeAiProvider.value = settings.value.aiActiveProvider

  for (const provider of providerOptions) {
    const config = settings.value.aiClientConfigs[provider.id]
    const modelId = config?.modelId || ''
    aiDraft[provider.id] = {
      baseUrl: config?.baseUrl || provider.defaultBaseUrl,
      apiKey: '',
      apiKeyMasked: config?.apiKeyMasked || '',
      modelId,
      models: modelId ? [modelId] : [],
      modelLoading: false,
      modelError: '',
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
      apiKeyMasked: draft.apiKey.trim() ? undefined : draft.apiKeyMasked,
      modelId: draft.modelId.trim() || undefined
    }]
  })) as AiClientConfigs

  await saveAiClientSettings(activeAiProvider.value, configs)
  for (const provider of providerOptions) {
    aiDraft[provider.id].apiKey = ''
  }
}

async function loadAiModels() {
  const draft = activeAiDraft.value
  draft.modelLoading = true
  draft.modelError = ''
  try {
    const response = await fetchAiModels(activeAiProvider.value, {
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || undefined,
      apiKeyMasked: draft.apiKey.trim() ? undefined : draft.apiKeyMasked
    })
    draft.models = response.models
    const firstModel = response.models[0]
    if (!draft.modelId && firstModel) {
      draft.modelId = firstModel
    }
  } catch (caught) {
    const normalized = normalizeApiError(caught)
    draft.modelError = normalized.message
  } finally {
    draft.modelLoading = false
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
    <section v-if="error" class="settings-page__error surface-panel" role="alert">
      <div>
        <h2 class="settings-page__error-title">设置加载失败</h2>
        <p class="settings-page__error-message">{{ error.message }}</p>
      </div>
      <AppButton variant="secondary" :loading="loading" @click="loadSettings">
        重试
      </AppButton>
    </section>

    <SettingsSection title="界面皮肤" description="选择您喜爱的控制台皮肤风格。">
      <div class="theme-selector-grid">
        <button 
          type="button"
          class="theme-card theme-card--light" 
          :class="{ 'theme-card--active': theme === 'default' }"
          @click="setTheme('default')"
        >
          <div class="theme-preview theme-preview--light">
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-line header"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span class="theme-name">经典浅色 (Light Mode)</span>
        </button>
        <button 
          type="button"
          class="theme-card theme-card--cyber" 
          :class="{ 'theme-card--active': theme === 'cyber' }"
          @click="setTheme('cyber')"
        >
          <div class="theme-preview theme-preview--cyber">
            <div class="preview-glow"></div>
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-line header"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span class="theme-name">赛博霓虹 (Cyber Glow)</span>
        </button>
      </div>
    </SettingsSection>

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

    <VendorSyncCard />

    <SettingsSection title="AI provider" description="填写 Base URL 和 API Key 后手动获取模型，再选择当前要使用的模型。">
      <form class="settings-page__form" @submit.prevent="submitAiConfigs">
        <article class="settings-page__provider">
          <div class="settings-page__provider-heading">
            <div>
              <h3>{{ activeAiProviderOption.label }}</h3>
              <p>{{ activeAiProviderOption.baseUrlEnv }} / {{ activeAiProviderOption.keyEnv }}</p>
            </div>
            <StatusBadge
              :label="activeAiDraft.configured ? activeAiDraft.apiKeyMasked || '已配置' : '未配置'"
              :tone="activeAiDraft.configured ? 'success' : 'neutral'"
            />
          </div>

          <div class="settings-page__grid settings-page__grid--two">
            <label class="settings-page__select-field">
              <span>Provider</span>
              <select v-model="activeAiProvider">
                <option
                  v-for="provider in providerOptions"
                  :key="provider.id"
                  :value="provider.id"
                >
                  {{ provider.label }}
                </option>
              </select>
            </label>
            <AppInput
              v-model="activeAiDraft.baseUrl"
              label="Base URL"
            />
            <AppInput
              v-model="activeAiDraft.apiKey"
              label="API Key"
              type="password"
              placeholder="留空则保留原 Key"
            />
            <label class="settings-page__select-field">
              <span>模型</span>
              <select v-model="activeAiDraft.modelId" :disabled="activeAiModelOptions.length === 0">
                <option value="">
                  {{ activeAiModelOptions.length === 0 ? '请先获取模型' : '选择模型' }}
                </option>
                <option
                  v-for="model in activeAiModelOptions"
                  :key="model"
                  :value="model"
                >
                  {{ model }}
                </option>
              </select>
            </label>
          </div>

          <p v-if="activeAiDraft.modelError" class="settings-page__provider-error">
            {{ activeAiDraft.modelError }}
          </p>
        </article>
        <div class="settings-page__actions">
          <AppButton type="button" variant="secondary" :loading="activeAiDraft.modelLoading" @click="loadAiModels">
            获取模型
          </AppButton>
          <AppButton type="submit" :loading="saving">
            保存 AI 设置
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

.settings-page__select-field {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.settings-page__select-field span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.settings-page__select-field select {
  width: 100%;
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  padding: 0 var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.settings-page__select-field select:disabled {
  background: var(--color-surface-muted);
  color: var(--color-text-soft);
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

.settings-page__provider-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 700;
}

.settings-page__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 760px) {
  .settings-page {
    gap: var(--space-3);
  }

  .settings-page__error,
  .settings-page__provider-heading {
    display: grid;
  }

  .settings-page__grid,
  .settings-page__grid--two {
    grid-template-columns: 1fr;
  }

  .settings-page__actions {
    display: grid;
    justify-content: stretch;
  }

  .settings-page__actions :deep(.app-button) {
    width: 100%;
  }

  .settings-page__select-field select {
    min-height: var(--control-height-mobile);
  }
}

/* 主题选择卡片设计 */
.theme-selector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  cursor: pointer;
  outline: none;
  transition: transform var(--transition-bounce), box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.theme-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-card-hover);
}

.theme-card--active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft), var(--shadow-card-hover);
}

.theme-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: var(--radius-2);
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  transition: border-color var(--transition-fast);
}

/* 经典浅色微缩图 */
.theme-preview--light {
  background: #f6f8fb;
}

.theme-preview--light .preview-sidebar {
  width: 25%;
  background: #ffffff;
  border-right: 1px solid #d9e0ea;
}

.theme-preview--light .preview-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-preview--light .preview-line {
  height: 4px;
  background: #d9e0ea;
  border-radius: 2px;
  width: 40%;
}

.theme-preview--light .preview-card {
  flex: 1;
  background: #ffffff;
  border: 1px solid #d9e0ea;
  border-radius: 4px;
}

/* 赛博霓虹微缩图 */
.theme-preview--cyber {
  background: #080b11;
}

.theme-preview--cyber .preview-glow {
  position: absolute;
  top: -10%;
  left: 20%;
  width: 80%;
  height: 80%;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.4) 0%, rgba(37, 99, 235, 0) 70%);
  filter: blur(8px);
}

.theme-preview--cyber .preview-sidebar {
  position: relative;
  z-index: 1;
  width: 25%;
  background: rgba(17, 25, 40, 0.75);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(2px);
}

.theme-preview--cyber .preview-content {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-preview--cyber .preview-line {
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  width: 40%;
}

.theme-preview--cyber .preview-card {
  flex: 1;
  background: rgba(17, 25, 40, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.theme-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  transition: color var(--transition-fast);
}

.theme-card--active .theme-name {
  color: var(--color-primary);
}

@media (max-width: 760px) {
  .theme-selector-grid {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
}
</style>
