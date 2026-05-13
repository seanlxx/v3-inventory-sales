<script setup lang="ts">
definePageMeta({
  title: '商品'
})

const sections = [
  '商品表格占位',
  '商品表单占位',
  '商品库存流水入口占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="商品"
    description="商品页只管理主数据，库存字段保持只读，库存变化必须来自库存流水。"
    :sections="sections"
  />
</template>
