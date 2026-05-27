<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  values: readonly number[]
  width?: number
  height?: number
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  ariaLabel?: string
}>(), {
  width: 96,
  height: 28,
  tone: 'primary',
  ariaLabel: '近期销售趋势'
})

const colors: Record<string, { stroke: string, fill: string, dot: string }> = {
  primary: { stroke: 'var(--color-primary, #2563eb)', fill: 'rgba(37, 99, 235, 0.16)', dot: 'var(--color-primary, #2563eb)' },
  success: { stroke: 'var(--color-inbound, #168a4a)', fill: 'rgba(22, 138, 74, 0.16)', dot: 'var(--color-inbound, #168a4a)' },
  warning: { stroke: 'var(--color-warning, #c77700)', fill: 'rgba(199, 119, 0, 0.16)', dot: 'var(--color-warning, #c77700)' },
  danger: { stroke: 'var(--color-danger, #c2410c)', fill: 'rgba(194, 65, 12, 0.16)', dot: 'var(--color-danger, #c2410c)' },
  neutral: { stroke: 'var(--color-text-muted, #6b7280)', fill: 'rgba(107, 114, 128, 0.16)', dot: 'var(--color-text-muted, #6b7280)' }
}

const palette = computed(() => colors[props.tone] ?? colors.primary!)

const padding = 2

const points = computed(() => {
  const values = props.values || []
  if (values.length === 0) return [] as { x: number, y: number, v: number }[]
  const max = Math.max(...values, 1)
  const min = 0
  const range = max - min || 1
  const innerW = props.width - padding * 2
  const innerH = props.height - padding * 2
  const step = values.length > 1 ? innerW / (values.length - 1) : 0
  return values.map((v, i) => ({
    x: padding + (values.length === 1 ? innerW / 2 : i * step),
    y: padding + innerH - ((v - min) / range) * innerH,
    v
  }))
})

const path = computed(() => {
  if (points.value.length === 0) return ''
  return points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
})

const areaPath = computed(() => {
  if (points.value.length === 0) return ''
  const baseY = props.height - padding
  const first = points.value[0]!
  const last = points.value[points.value.length - 1]!
  return `${path.value} L${last.x.toFixed(2)},${baseY} L${first.x.toFixed(2)},${baseY} Z`
})

const lastPoint = computed(() => points.value[points.value.length - 1] || null)

const total = computed(() => (props.values || []).reduce((sum, v) => sum + (Number(v) || 0), 0))

const isEmpty = computed(() => total.value === 0)
</script>

<template>
  <div class="sparkline" :class="{ 'sparkline--empty': isEmpty }" :title="`近 ${(props.values || []).length} 天销量 共 ${total}`">
    <svg
      v-if="!isEmpty"
      class="sparkline__svg"
      :width="props.width"
      :height="props.height"
      :viewBox="`0 0 ${props.width} ${props.height}`"
      role="img"
      :aria-label="props.ariaLabel"
    >
      <path :d="areaPath" :fill="palette.fill" stroke="none" />
      <path :d="path" :stroke="palette.stroke" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" fill="none" />
      <circle v-if="lastPoint" :cx="lastPoint.x" :cy="lastPoint.y" r="2" :fill="palette.dot" />
    </svg>
    <span v-else class="sparkline__empty">— 暂无 —</span>
  </div>
</template>

<style scoped>
.sparkline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  min-height: 28px;
}

.sparkline__svg {
  display: block;
}

.sparkline__empty {
  color: var(--color-text-muted);
  font-size: 11px;
}
</style>
