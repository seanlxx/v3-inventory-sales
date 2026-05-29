export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  authStore.initialize()

  if (to.path === '/login') {
    if (authStore.isAuthenticated) {
      return navigateTo('/dashboard', { replace: true })
    }
    return
  }

  if (!authStore.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { replace: true })
  }
})
