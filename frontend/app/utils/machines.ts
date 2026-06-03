export const DEFAULT_MACHINE_OPTIONS = ['1号机', '2号机', '3号机', '轨道机'] as const

const defaultMachineOrder = new Map<string, number>(
  DEFAULT_MACHINE_OPTIONS.map((machine, index) => [machine, index])
)

export function sortMachineOptions(machines: Iterable<string>) {
  return Array.from(machines).sort((left, right) => {
    const leftIndex = defaultMachineOrder.get(left)
    const rightIndex = defaultMachineOrder.get(right)
    if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex
    if (leftIndex !== undefined) return -1
    if (rightIndex !== undefined) return 1
    return left.localeCompare(right, 'zh-CN')
  })
}

export function machineOptionsWithDefaults(values: Iterable<string | null | undefined>) {
  const machines = new Set<string>(DEFAULT_MACHINE_OPTIONS)
  for (const value of values) {
    const machine = String(value || '').trim()
    if (machine) machines.add(machine)
  }
  return sortMachineOptions(machines)
}
