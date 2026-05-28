export default defineNuxtRouteMiddleware((to) => {
  // 仅在客户端运行以保护静态页面生成 (nuxt generate)
  if (import.meta.server) return

  if (to.path === '/login') {
    return navigateTo('/dashboard', { replace: true })
  }
})
