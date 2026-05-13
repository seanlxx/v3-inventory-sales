<script setup lang="ts">
definePageMeta({
  title: '销售'
})

const sections = [
  '销售单列表占位',
  '退款与损耗分段占位',
  '库存不足校验展示占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="销售"
    description="销售、退款、损耗会保持独立业务动作，不用负数混在同一类单据里。"
    :sections="sections"
  />
</template>
