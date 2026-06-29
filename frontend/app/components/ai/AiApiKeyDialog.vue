<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  submitting?: boolean
}>(), {
  submitting: false
})

const emit = defineEmits<{
  submit: [apiKey: string]
}>()

const apiKey = shallowRef('')
const error = shallowRef('')

function closeDialog() {
  open.value = false
  apiKey.value = ''
  error.value = ''
}

function submitKey() {
  const trimmed = apiKey.value.trim()
  if (!trimmed) {
    error.value = '请填写本次 AI 识别使用的 API Key'
    return
  }
  emit('submit', trimmed)
  apiKey.value = ''
  error.value = ''
  open.value = false
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="填写 API Key"
    description="API Key 只用于本次识别请求，不会保存到浏览器、数据库或 Cloudflare。"
    @close="closeDialog"
  >
    <form class="ai-api-key-dialog" @submit.prevent="submitKey">
      <AppInput
        v-model="apiKey"
        label="API Key"
        type="password"
        autocomplete="off"
        placeholder="粘贴本次使用的 key"
        :error="error"
      />
    </form>

    <template #footer>
      <AppButton type="button" variant="secondary" :disabled="props.submitting" @click="closeDialog">
        取消
      </AppButton>
      <AppButton type="button" :loading="props.submitting" @click="submitKey">
        开始识别
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.ai-api-key-dialog {
  display: grid;
  gap: var(--space-4);
}
</style>
