import type { ApiError } from '~/types/api'
import type { VendorSyncPayload, VendorSyncRun, VendorSyncStatus } from '~/types/vendorSync'

const defaultStatus: VendorSyncStatus = {
  credentials: { configured: false },
  mapping: {
    localMachineName: '三号机',
    vendorDeviceCode: '33f70ee6d9bfac1',
    vendorMachineId: '42310'
  },
  lastRun: null
}

export function useVendorSync() {
  const { request } = useApi()
  const toastStore = useToastStore()

  const status = shallowRef<VendorSyncStatus>({ ...defaultStatus })
  const latestRun = shallowRef<VendorSyncRun | null>(null)
  const loading = shallowRef(false)
  const syncing = shallowRef(false)
  const error = shallowRef<ApiError | null>(null)

  async function loadStatus() {
    loading.value = true
    error.value = null
    try {
      status.value = await request<VendorSyncStatus>('/integrations/shengma/status')
      latestRun.value = status.value.lastRun
    } catch (caught) {
      error.value = normalizeApiError(caught)
    } finally {
      loading.value = false
    }
  }

  async function sync(payload: VendorSyncPayload) {
    syncing.value = true
    error.value = null
    try {
      const run = await request<VendorSyncRun, VendorSyncPayload>('/integrations/shengma/sync', {
        method: 'POST',
        body: payload
      })
      latestRun.value = run
      status.value = { ...status.value, lastRun: run }
      toastStore.show(payload.dryRun ? '预览同步完成' : '三号机同步完成', run.status === 'success' ? 'success' : 'warning')
      return run
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      syncing.value = false
    }
  }

  return {
    status,
    latestRun,
    loading,
    syncing,
    error,
    loadStatus,
    sync
  }
}

