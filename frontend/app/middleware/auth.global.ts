export default defineNuxtRouteMiddleware((to) => {
  // 仅在客户端运行以保护静态页面生成 (nuxt generate)
  if (import.meta.server) return

  const authStore = useAuthStore()
  authStore.initialize() // 确保从本地会话中恢复登录状态

  const isAuthenticated = authStore.isAuthenticated

  // 1. 如果用户未登录，并且访问的不是 /login 页面，重定向到登录页并附带原路由 query
  if (!isAuthenticated && to.path !== '/login') {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  }

  // 2. 如果用户已登录，且当前试图访问 /login，则重定向到工作台
  if (isAuthenticated && to.path === '/login') {
    return navigateTo('/dashboard')
  }
})
