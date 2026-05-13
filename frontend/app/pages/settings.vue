<script setup lang="ts">
definePageMeta({
  title: '设置'
})

const sections = [
  '账号与密码占位',
  '机器与分类配置占位',
  'AI provider 配置占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="设置"
    description="设置页承载低频配置，敏感配置后续需要脱敏展示并避免日志输出。"
    :sections="sections"
  />
</template>
