import type { ApiError } from '~/types/api'
import type { VendorSyncPayload, VendorSyncRun, VendorSyncSchedule, VendorSyncSchedulePayload, VendorSyncStatus } from '~/types/vendorSync'

const defaultSchedule: VendorSyncSchedule = {
  enabled: false,
  mode: 'daily',
  dailyTime: '09:00',
  intervalMinutes: 60,
  scope: ['inventory', 'sales'],
  windowDays: 1,
  timezoneOffsetMinutes: 480,
  lastTriggerAt: null,
  nextRunAt: null
}

const defaultStatus: VendorSyncStatus = {
  credentials: { configured: false },
  mapping: {
    localMachineName: '三号机',
    vendorDeviceCode: '33f70ee6d9bfac1',
    vendorMachineId: '42310'
  },
  lastRun: null,
  schedule: { ...defaultSchedule }
}

export function useVendorSync() {
  const { request } = useApi()
  const toastStore = useToastStore()

  const status = shallowRef<VendorSyncStatus>({ ...defaultStatus })
  const latestRun = shallowRef<VendorSyncRun | null>(null)
  const loading = shallowRef(false)
  const syncing = shallowRef(false)
  const savingSchedule = shallowRef(false)
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

  async function saveSchedule(payload: VendorSyncSchedulePayload) {
    savingSchedule.value = true
    error.value = null
    try {
      const schedule = await request<VendorSyncSchedule, VendorSyncSchedulePayload>('/integrations/shengma/schedule', {
        method: 'PUT',
        body: payload
      })
      status.value = { ...status.value, schedule }
      toastStore.show(schedule.enabled ? '自动同步已启用' : '自动同步已保存', 'success')
      return schedule
    } catch (caught) {
      error.value = normalizeApiError(caught)
      throw error.value
    } finally {
      savingSchedule.value = false
    }
  }

  return {
    status,
    latestRun,
    loading,
    syncing,
    savingSchedule,
    error,
    loadStatus,
    sync,
    saveSchedule
  }
}


