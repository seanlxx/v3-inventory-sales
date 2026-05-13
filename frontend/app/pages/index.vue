<script setup lang="ts">
definePageMeta({
  title: '工作台'
})

const sections = [
  '这是 Nuxt 新 UI 的并行开发入口。',
  '当前阶段只验证路由、布局和构建链路。',
  '线上入口仍由旧静态前端负责。'
] as const
</script>

<template>
  <PagePlaceholder
    title="工作台入口"
    description="Nuxt 4 骨架已独立放在 frontend 子目录，后续页面会在这里逐步接入组件和 API。"
    :sections="sections"
  />
</template>
