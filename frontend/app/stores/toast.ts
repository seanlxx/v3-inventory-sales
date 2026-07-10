type ToastTone = 'info' | 'success' | 'warning' | 'danger'

type ToastMessage = {
  id: number
  tone: ToastTone
  message: string
}

const DEFAULT_DURATION_MS = 4500
const DANGER_DURATION_MS = 7000

export const useToastStore = defineStore('toast', () => {
  const messages = shallowRef<ToastMessage[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 1

  const latest = computed(() => messages.value[0] ?? null)

  function clearTimer(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function clear(id?: number) {
    if (id === undefined) {
      for (const message of messages.value) clearTimer(message.id)
      messages.value = []
      return
    }
    clearTimer(id)
    messages.value = messages.value.filter(item => item.id !== id)
  }

  function show(message: string, tone: ToastTone = 'info') {
    const nextMessage = { id: nextId++, tone, message }
    const nextMessages = [nextMessage, ...messages.value].slice(0, 3)
    const retainedIds = new Set(nextMessages.map(item => item.id))
    for (const existing of messages.value) {
      if (!retainedIds.has(existing.id)) clearTimer(existing.id)
    }
    messages.value = nextMessages

    if (import.meta.client) {
      const duration = tone === 'danger' ? DANGER_DURATION_MS : DEFAULT_DURATION_MS
      timers.set(nextMessage.id, setTimeout(() => clear(nextMessage.id), duration))
    }
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
