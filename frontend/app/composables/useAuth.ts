export function useAuth() {
  const authStore = useAuthStore()
  const refs = storeToRefs(authStore)

  if (import.meta.client) {
    authStore.initialize()
  }

  return {
    ...refs,
    initialize: authStore.initialize,
    login: authStore.login,
    fetchProfile: authStore.fetchProfile,
    updateAuth: authStore.updateAuth,
    logout: authStore.logout
  }
}
