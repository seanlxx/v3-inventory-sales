export type VendorSyncScope = 'inventory' | 'sales'

export type VendorSyncSummary = {
  salesImported: number
  salesDuplicate: number
  salesSkipped: number
  productsCreated: number
  pricesUpdated: number
  costsUpdated: number
  inventoryAdjusted: number
  warnings: number
}

export type VendorSyncRunStatus = 'running' | 'success' | 'failed'

export type VendorSyncRun = {
  id: number
  startedAt: number
  finishedAt: number | null
  status: VendorSyncRunStatus
  dryRun: boolean
  dateRange: {
    start: string
    end: string
  }
  summary: VendorSyncSummary | null
  warnings: string[]
  errorMessage?: string
}

export type VendorSyncStatus = {
  credentials: {
    configured: boolean
  }
  mapping: {
    localMachineName: string
    vendorDeviceCode: string
    vendorMachineId: string
  }
  lastRun: VendorSyncRun | null
  schedule: VendorSyncSchedule
}

export type VendorSyncScheduleMode = 'daily' | 'interval'

export type VendorSyncSchedule = {
  enabled: boolean
  mode: VendorSyncScheduleMode
  dailyTime: string
  intervalMinutes: number
  scope: VendorSyncScope[]
  windowDays: number
  timezoneOffsetMinutes: number
  lastTriggerAt: number | null
  nextRunAt: number | null
}

export type VendorSyncSchedulePayload = {
  enabled: boolean
  mode: VendorSyncScheduleMode
  dailyTime: string
  intervalMinutes: number
  scope: VendorSyncScope[]
  windowDays: number
  timezoneOffsetMinutes?: number
}

export type VendorSyncPayload = {
  startDate: string
  endDate: string
  dryRun: boolean
  scope: VendorSyncScope[]
}

