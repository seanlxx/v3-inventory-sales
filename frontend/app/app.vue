<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'

const { initTheme } = useTheme()
const appReady = ref(false)

onMounted(() => {
  initTheme()
  appReady.value = true
})
</script>

<template>
  <div v-if="!appReady" class="app-startup" role="status" aria-label="正在载入系统">
    <div class="app-startup__mark" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span class="app-startup__slot--active"></span>
    </div>
  </div>

  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>

<style scoped>
.app-startup {
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  background: #f3f6fa;
}

.app-startup__mark {
  display: grid;
  grid-template-columns: repeat(2, 8px);
  grid-template-rows: repeat(2, 8px);
  gap: 4px;
  place-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid #d9e0ea;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(30, 44, 71, 0.08);
}

.app-startup__mark span {
  border-radius: 3px;
  background: #b8c2d1;
}

.app-startup__mark .app-startup__slot--active {
  background: #2854c5;
}
</style>
