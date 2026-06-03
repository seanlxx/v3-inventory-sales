export const DEFAULT_MACHINE_OPTIONS = ['1号机', '2号机', '3号机', '轨道机'] as const

const LEGACY_SHARED_MACHINE_IDS = new Set(['1/2号机', '1/2号机总库存', '总库存'])

const MACHINE_ALIASES = new Map<string, string>([
  ['三号机', '轨道机']
])

const defaultMachineOrder = new Map<string, number>(
  DEFAULT_MACHINE_OPTIONS.map((machine, index) => [machine, index])
)

export function canonicalMachineOption(value: string | null | undefined) {
  const machine = String(value || '').trim()
  if (!machine || LEGACY_SHARED_MACHINE_IDS.has(machine)) return null
  return MACHINE_ALIASES.get(machine) || machine
}

export function machineMatchesOption(machine: string | null | undefined, option: string) {
  const normalizedMachine = canonicalMachineOption(machine)
  const normalizedOption = canonicalMachineOption(option)
  return !!normalizedMachine && !!normalizedOption && normalizedMachine === normalizedOption
}

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
    const machine = canonicalMachineOption(value)
    if (machine) machines.add(machine)
  }
  return sortMachineOptions(machines)
}
