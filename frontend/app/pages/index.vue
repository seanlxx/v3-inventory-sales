<script setup lang="ts">
definePageMeta({
  title: '仪表盘'
})

await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div class="visually-hidden">
    正在打开仪表盘
  </div>
</template>
