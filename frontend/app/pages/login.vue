<script setup lang="ts">
definePageMeta({
  layout: false
})

await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div class="visually-hidden">
    正在打开后台
  </div>
</template>
