<script setup lang="ts">
import { useSettings } from '~/composables/useSettings'
import { useAiSessionKey } from '~/composables/useAiSessionKey'
import { useTheme } from '~/composables/useTheme'
import type { BusinessSettings } from '~/types/settings'
import type { UpdateAuthPayload } from '~/types/auth'

definePageMeta({
  title: '设置'
})

const { theme, setTheme } = useTheme()

const {
  username,
  usesDefaultPassword
} = useAuth()

const aiSessionKey = useAiSessionKey()
const {
  settings,
  loading,
  saving,
  accountSaving,
  error,
  loadSettings,
  saveBusinessSettings,
  saveMachines,
  saveCategories,
  updateAccount
} = useSettings()

const businessDraft = reactive({
  lowStockThreshold: '3',
  restockTargetDays: '7'
})
const machinesDraft = shallowRef('')
const categoriesDraft = shallowRef('')
const aiApiKeyDraft = shallowRef('')
const aiApiKeyError = shallowRef('')
const aiApiKeyConfigured = computed(() => aiSessionKey.isConfigured.value)

function syncDrafts() {
  const business = settings.value.businessSettings
  businessDraft.lowStockThreshold = String(business.lowStockThreshold)
  businessDraft.restockTargetDays = String(business.restockTargetDays)
  machinesDraft.value = settings.value.machines.join('\n')
  categoriesDraft.value = settings.value.categories.join('\n')
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

function submitAiSessionKey() {
  const saved = aiSessionKey.saveApiKey(aiApiKeyDraft.value)
  if (!saved) {
    aiApiKeyError.value = '请填写本次登录使用的 AI API Key'
    return
  }
  aiApiKeyDraft.value = ''
  aiApiKeyError.value = ''
}

function clearAiSessionKey() {
  aiSessionKey.clearApiKey()
  aiApiKeyDraft.value = ''
  aiApiKeyError.value = ''
}

async function submitAccount(payload: UpdateAuthPayload) {
  await updateAccount(payload)
}

watch(settings, syncDrafts)

onMounted(async () => {
  aiSessionKey.initialize()
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
        <button 
          type="button"
          class="theme-card theme-card--crystal" 
          :class="{ 'theme-card--active': theme === 'crystal' }"
          @click="setTheme('crystal')"
        >
          <div class="theme-preview theme-preview--crystal">
            <div class="preview-prism"></div>
            <div class="preview-sidebar"></div>
            <div class="preview-content">
              <div class="preview-line header"></div>
              <div class="preview-card"></div>
            </div>
          </div>
          <span class="theme-name">白水晶玻璃 (Crystal Morphism)</span>
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

    <SettingsSection title="业务参数" description="用于库存提醒和补货建议的基础参数。">
      <form class="settings-page__form" @submit.prevent="submitBusinessSettings">
        <div class="settings-page__grid">
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

    <SettingsSection title="AI 识别密钥" description="本次登录填写一次，退出或登录失效后自动清除。">
      <template #aside>
        <StatusBadge
          :label="aiApiKeyConfigured ? '本次登录已填写' : '未填写'"
          :tone="aiApiKeyConfigured ? 'success' : 'warning'"
        />
      </template>
      <form class="settings-page__form" @submit.prevent="submitAiSessionKey">
        <div class="settings-page__grid settings-page__grid--two">
          <AppInput
            v-model="aiApiKeyDraft"
            label="API Key"
            type="password"
            autocomplete="off"
            placeholder="填写本次登录使用的 key"
            :error="aiApiKeyError"
          />
          <div class="settings-page__ai-meta">
            <span>中转</span>
            <strong>https://api.243706.xyz/v1</strong>
            <span>模型</span>
            <strong>gpt5.5</strong>
          </div>
        </div>
        <div class="settings-page__actions">
          <AppButton type="button" variant="secondary" :disabled="!aiApiKeyConfigured" @click="clearAiSessionKey">
            清除本次密钥
          </AppButton>
          <AppButton type="submit">
            保存到本次登录
          </AppButton>
        </div>
      </form>
    </SettingsSection>

    <ClientOnly>
      <ZnImportCard />
    </ClientOnly>

    <VendorSyncCard />
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

.settings-page__form {
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

.settings-page__ai-meta {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface-subtle);
}

.settings-page__ai-meta span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.settings-page__ai-meta strong {
  min-width: 0;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
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

  .settings-page__error {
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
}

/* 主题选择卡片设计 */
.theme-selector-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

/* 白水晶微缩图 */
.theme-preview--crystal {
  background: linear-gradient(135deg, #f6f8fb 0%, #eef3f8 100%);
}

.theme-preview--crystal .preview-prism {
  position: absolute;
  top: -20%;
  left: 10%;
  width: 90%;
  height: 90%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(168, 85, 247, 0.08) 40%, rgba(255, 255, 255, 0) 70%);
  filter: blur(6px);
  animation: preview-prism-spin 8s infinite linear alternate;
}

@keyframes preview-prism-spin {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(10px, 5px) rotate(15deg); }
}

.theme-preview--crystal .preview-sidebar {
  position: relative;
  z-index: 1;
  width: 25%;
  background: rgba(255, 255, 255, 0.4);
  border-right: 1px solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(2px);
}

.theme-preview--crystal .preview-content {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-preview--crystal .preview-line {
  height: 4px;
  background: rgba(94, 107, 132, 0.25);
  border-radius: 2px;
  width: 40%;
}

.theme-preview--crystal .preview-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(23, 32, 51, 0.02);
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
