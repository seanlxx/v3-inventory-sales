<script setup lang="ts">
import type { UpdateAuthPayload } from '~/types/auth'

const props = defineProps<{
  username: string
  usesDefaultPassword: boolean
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: UpdateAuthPayload]
}>()

const draft = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const errorMessage = shallowRef('')

watch(() => props.username, username => {
  draft.username = username || 'admin'
}, { immediate: true })

function submitForm() {
  errorMessage.value = ''
  if (!draft.username.trim()) {
    errorMessage.value = '请填写账号名称'
    return
  }
  if (!draft.currentPassword) {
    errorMessage.value = '请输入当前密码'
    return
  }
  if (draft.newPassword && draft.newPassword !== draft.confirmPassword) {
    errorMessage.value = '两次输入的新密码不一致'
    return
  }

  emit('submit', {
    username: draft.username.trim(),
    currentPassword: draft.currentPassword,
    newPassword: draft.newPassword || undefined
  })
  draft.currentPassword = ''
  draft.newPassword = ''
  draft.confirmPassword = ''
}
</script>

<template>
  <form class="account-form" @submit.prevent="submitForm">
    <StatusBadge
      v-if="props.usesDefaultPassword"
      label="正在使用默认密码"
      tone="warning"
    />
    <div class="account-form__grid">
      <AppInput v-model="draft.username" label="账号" autocomplete="username" />
      <AppInput
        v-model="draft.currentPassword"
        label="当前密码"
        type="password"
        autocomplete="current-password"
      />
      <AppInput
        v-model="draft.newPassword"
        label="新密码"
        type="password"
        placeholder="留空则不修改"
        autocomplete="new-password"
      />
      <AppInput
        v-model="draft.confirmPassword"
        label="确认新密码"
        type="password"
        autocomplete="new-password"
      />
    </div>
    <p v-if="errorMessage" class="account-form__error">
      {{ errorMessage }}
    </p>
    <div class="account-form__actions">
      <AppButton type="submit" :loading="props.submitting">
        保存账号
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.account-form {
  display: grid;
  gap: var(--space-4);
}

.account-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.account-form__error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 700;
}

.account-form__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .account-form__grid {
    grid-template-columns: 1fr;
  }

  .account-form__actions {
    justify-content: stretch;
  }

  .account-form__actions :deep(.app-button) {
    width: 100%;
  }
}
</style>
