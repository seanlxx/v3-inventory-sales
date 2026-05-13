<script setup lang="ts">
definePageMeta({
  title: '库存'
})

const sections = [
  '库存余额表占位',
  '库存流水时间线占位',
  '盘点调整入口占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="库存"
    description="库存页展示库存真相，余额来自服务端缓存，可信来源始终是 stock_movements。"
    :sections="sections"
  />
</template>
