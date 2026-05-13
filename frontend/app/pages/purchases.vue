<script setup lang="ts">
definePageMeta({
  title: '进货'
})

const sections = [
  '进货单列表占位',
  '进货明细编辑器占位',
  'AI 识别审核入口占位'
] as const
</script>

<template>
  <PagePlaceholder
    title="进货"
    description="进货页后续以进货单为中心，确认提交后由服务端创建入库流水。"
    :sections="sections"
  />
</template>
