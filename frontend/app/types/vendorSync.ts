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
}

export type VendorSyncPayload = {
  startDate: string
  endDate: string
  dryRun: boolean
  scope: VendorSyncScope[]
}
