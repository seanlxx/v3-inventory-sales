type ToastTone = 'info' | 'success' | 'warning' | 'danger'

type ToastMessage = {
  id: number
  tone: ToastTone
  message: string
}

export const useToastStore = defineStore('toast', () => {
  const messages = shallowRef<ToastMessage[]>([])
  let nextId = 1

  const latest = computed(() => messages.value[0] ?? null)

  function show(message: string, tone: ToastTone = 'info') {
    messages.value = [
      { id: nextId++, tone, message },
      ...messages.value
    ].slice(0, 3)
  }

  function clear(id?: number) {
    if (id === undefined) {
      messages.value = []
      return
    }
    messages.value = messages.value.filter(item => item.id !== id)
  }

  return {
    messages,
    latest,
    show,
    clear
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastStore, import.meta.hot))
}
