<script setup lang="ts">
definePageMeta({
  title: '仪表盘'
})

const sections = [
  '月度 KPI 占位',
  '销售趋势占位',
  '低库存与异常提醒占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="仪表盘"
    description="后续只消费服务端报表聚合结果，不在浏览器重新计算利润、库存或成本。"
    :sections="sections"
  />
</template>
