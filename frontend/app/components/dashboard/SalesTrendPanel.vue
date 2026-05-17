<script setup lang="ts">
import type { SalesTrendPoint } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  points: readonly SalesTrendPoint[]
  loading?: boolean
}>()

const REVENUE_GRADIENT_ID = 'salesTrendRevenueArea'

type ChartPoint = {
  index: number
  date: string
  revenue: number
  quantity: number
  x: number
  revenueY: number
  quantityY: number
}

type DateLabel = ChartPoint & {
  visibleOnMobile: boolean
}

const compactChart = shallowRef(false)
const activeDate = shallowRef<string | null>(null)
let compactMediaQuery: MediaQueryList | null = null

const chartLayout = computed(() => {
  if (compactChart.value) {
    return {
      width: 430,
      height: 230,
      top: 18,
      right: 34,
      bottom: 194,
      left: 48
    }
  }

  return {
    width: 760,
    height: 230,
    top: 18,
    right: 54,
    bottom: 194,
    left: 58
  }
})

const plotWidth = computed(() => chartLayout.value.width - chartLayout.value.left - chartLayout.value.right)
const plotHeight = computed(() => chartLayout.value.bottom - chartLayout.value.top)

const maxRevenue = computed(() =>
  Math.max(...props.points.map(point => Number(point.revenue) || 0), 0)
)

const maxQuantity = computed(() =>
  Math.max(...props.points.map(point => Number(point.quantity) || 0), 0)
)

const hasTrendData = computed(() =>
  props.points.some(point => (Number(point.revenue) || 0) > 0 || (Number(point.quantity) || 0) > 0)
)

const averageRevenue = computed(() => {
  if (props.points.length === 0) return 0
  return props.points.reduce((sum, point) => sum + (Number(point.revenue) || 0), 0) / props.points.length
})

const averageRevenueY = computed(() => scaleY(averageRevenue.value, maxRevenue.value))

const chartPoints = computed<ChartPoint[]>(() =>
  props.points.map((point, index) => {
    const revenue = Number(point.revenue) || 0
    const quantity = Number(point.quantity) || 0
    return {
      index,
      date: point.date,
      revenue,
      quantity,
      x: scaleX(index, props.points.length),
      revenueY: scaleY(revenue, maxRevenue.value),
      quantityY: scaleY(quantity, maxQuantity.value)
    }
  })
)

const yAxisTicks = computed(() =>
  [1, 0.75, 0.5, 0.25, 0].map(ratio => ({
    ratio,
    y: chartLayout.value.top + (1 - ratio) * plotHeight.value,
    revenueLabel: formatMoneyTick(maxRevenue.value * ratio),
    quantityLabel: formatQuantityTick(maxQuantity.value * ratio)
  }))
)

const dateLabels = computed<DateLabel[]>(() => {
  const total = chartPoints.value.length
  if (total === 0) return []

  const desktopStep = total <= 7 ? 1 : Math.ceil(total / 6)
  const mobileIndexes = mobileLabelIndexes(total)
  const labelIndexes = new Set<number>([...mobileIndexes])

  chartPoints.value.forEach(point => {
    if (point.index % desktopStep === 0 || point.index === total - 1) {
      labelIndexes.add(point.index)
    }
  })

  return chartPoints.value
    .filter(point => labelIndexes.has(point.index))
    .map(point => ({
      ...point,
      visibleOnMobile: mobileIndexes.has(point.index)
    }))
})

const revenueLinePath = computed(() =>
  smoothPath(chartPoints.value.map(point => ({ x: point.x, y: point.revenueY })))
)

const revenueAreaPath = computed(() =>
  areaPath(chartPoints.value.map(point => ({ x: point.x, y: point.revenueY })))
)

const quantityLinePath = computed(() =>
  smoothPath(chartPoints.value.map(point => ({ x: point.x, y: point.quantityY })))
)

const chartSummary = computed(() => {
  const peak = chartPoints.value.reduce<ChartPoint | null>((current, point) => {
    if (!current || point.revenue > current.revenue) return point
    return current
  }, null)
  if (!peak) return '销售趋势图'
  return `销售趋势图，最高销售额出现在 ${peak.date}，${formatMoney(peak.revenue)}，销量 ${formatQuantity(peak.quantity)} 件`
})

const activePoint = computed(() =>
  chartPoints.value.find(point => point.date === activeDate.value) ?? null
)

const pointHitWidth = computed(() => {
  const total = chartPoints.value.length
  if (total <= 1) return plotWidth.value
  return Math.max(24, plotWidth.value / (total - 1))
})

const tooltipPosition = computed(() => {
  const point = activePoint.value
  if (!point) return null

  const width = compactChart.value ? 146 : 168
  const height = 98
  const minX = chartLayout.value.left
  const maxX = chartLayout.value.width - chartLayout.value.right - width
  const x = clamp(point.x - width / 2, minX, Math.max(minX, maxX))
  const y = clamp(
    point.revenueY - height - 14,
    chartLayout.value.top + 4,
    chartLayout.value.bottom - height - 12
  )

  return {
    x,
    y,
    width,
    height,
    arrowX: clamp(point.x - x, 14, width - 14)
  }
})

onMounted(() => {
  compactMediaQuery = window.matchMedia('(max-width: 760px)')
  syncCompactChart(compactMediaQuery)
  compactMediaQuery.addEventListener('change', syncCompactChart)
})

onBeforeUnmount(() => {
  compactMediaQuery?.removeEventListener('change', syncCompactChart)
})

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}

function scaleX(index: number, total: number) {
  if (total <= 1) return chartLayout.value.left + plotWidth.value / 2
  return chartLayout.value.left + (index / (total - 1)) * plotWidth.value
}

function scaleY(value: number, maxValue: number) {
  if (!maxValue) return chartLayout.value.bottom
  return chartLayout.value.top + (1 - Math.max(0, value) / maxValue) * plotHeight.value
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(2))
}

function smoothPath(points: Array<{ x: number, y: number }>) {
  if (points.length === 0) return ''
  const first = points[0]!
  const segments = [`M ${formatCoordinate(first.x)} ${formatCoordinate(first.y)}`]

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!
    const previous = points[index - 1] ?? current
    const next = points[index + 1]!
    const afterNext = points[index + 2] ?? next
    const controlOneX = current.x + (next.x - previous.x) / 6
    const controlOneY = current.y + (next.y - previous.y) / 6
    const controlTwoX = next.x - (afterNext.x - current.x) / 6
    const controlTwoY = next.y - (afterNext.y - current.y) / 6

    segments.push([
      'C',
      formatCoordinate(controlOneX),
      formatCoordinate(controlOneY),
      formatCoordinate(controlTwoX),
      formatCoordinate(controlTwoY),
      formatCoordinate(next.x),
      formatCoordinate(next.y)
    ].join(' '))
  }

  return segments.join(' ')
}

function areaPath(points: Array<{ x: number, y: number }>) {
  if (points.length === 0) return ''
  const first = points[0]!
  const last = points[points.length - 1]!
  return [
    smoothPath(points),
    `L ${formatCoordinate(last.x)} ${chartLayout.value.bottom}`,
    `L ${formatCoordinate(first.x)} ${chartLayout.value.bottom}`,
    'Z'
  ].join(' ')
}

function formatMoneyTick(value: number) {
  if (value >= 10000) return `¥${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `¥${(value / 1000).toFixed(1)}千`
  return `¥${Math.round(value)}`
}

function formatQuantityTick(value: number) {
  return formatQuantity(Math.round(value))
}

function pointTitle(point: ChartPoint) {
  return `${point.date} ${formatMoney(point.revenue)} / ${formatQuantity(point.quantity)} 件`
}

function mobileLabelIndexes(total: number) {
  if (total <= 4) {
    return new Set(Array.from({ length: total }, (_, index) => index))
  }
  return new Set([0, Math.floor((total - 1) / 2), total - 1])
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function hitAreaX(point: ChartPoint) {
  return clamp(
    point.x - pointHitWidth.value / 2,
    chartLayout.value.left,
    chartLayout.value.width - chartLayout.value.right - pointHitWidth.value
  )
}

function syncCompactChart(event: MediaQueryList | MediaQueryListEvent) {
  compactChart.value = event.matches
}

function setActivePoint(point: ChartPoint) {
  activeDate.value = point.date
}

function clearActivePoint() {
  activeDate.value = null
}

function averageDeltaText(point: ChartPoint) {
  const delta = point.revenue - averageRevenue.value
  const label = formatMoney(Math.abs(delta))
  if (Math.abs(delta) < 0.01) return '持平日均'
  return delta > 0 ? `高于日均 ${label}` : `低于日均 ${label}`
}
</script>

<template>
  <section class="sales-trend surface-panel" aria-label="销售趋势">
    <header class="sales-trend__header">
      <div>
        <h2 class="sales-trend__title">销售趋势</h2>
        <p class="sales-trend__description">最近 {{ props.points.length }} 天销售额与销量走势</p>
      </div>
      <StatusBadge :label="`${props.points.length} 天`" tone="info" />
    </header>

    <div v-if="props.loading" class="sales-trend__empty">
      加载趋势数据
    </div>
    <div v-else-if="props.points.length === 0 || !hasTrendData" class="sales-trend__empty">
      当前范围暂无销售趋势
    </div>
    <div v-else class="sales-trend__chart" role="group" :aria-label="chartSummary">
      <div class="sales-trend__legend" aria-hidden="true">
        <span class="sales-trend__legend-item">
          <span class="sales-trend__legend-dot sales-trend__legend-dot--revenue" />
          销售额
        </span>
        <span class="sales-trend__legend-item">
          <span class="sales-trend__legend-dot sales-trend__legend-dot--quantity" />
          销量
        </span>
        <span class="sales-trend__legend-item">
          <span class="sales-trend__legend-line" />
          日均销售额
        </span>
      </div>

      <div
        class="sales-trend__plot"
        @mouseleave="clearActivePoint"
        @focusout="clearActivePoint"
      >
        <svg
          class="sales-trend__svg"
          :viewBox="`0 0 ${chartLayout.width} ${chartLayout.height}`"
          role="img"
          :aria-label="chartSummary"
        >
          <defs>
            <linearGradient :id="REVENUE_GRADIENT_ID" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.28" />
              <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.04" />
            </linearGradient>
          </defs>

          <g class="sales-trend__grid-layer">
            <line
              v-for="tick in yAxisTicks"
              :key="tick.ratio"
              class="sales-trend__grid-line"
              :x1="chartLayout.left"
              :x2="chartLayout.width - chartLayout.right"
              :y1="tick.y"
              :y2="tick.y"
            />
            <line
              v-for="label in dateLabels"
              :key="`x-${label.date}`"
              class="sales-trend__grid-line sales-trend__grid-line--vertical"
              :class="{ 'sales-trend__grid-line--mobile-hidden': !label.visibleOnMobile }"
              :x1="label.x"
              :x2="label.x"
              :y1="chartLayout.top"
              :y2="chartLayout.bottom"
            />
          </g>

          <path
            class="sales-trend__area"
            :d="revenueAreaPath"
            :fill="`url(#${REVENUE_GRADIENT_ID})`"
          />
          <line
            v-if="averageRevenue > 0"
            class="sales-trend__average-line"
            :x1="chartLayout.left"
            :x2="chartLayout.width - chartLayout.right"
            :y1="averageRevenueY"
            :y2="averageRevenueY"
          />
          <path class="sales-trend__line sales-trend__line--revenue" :d="revenueLinePath" />
          <path class="sales-trend__line sales-trend__line--quantity" :d="quantityLinePath" />

          <g v-if="activePoint" class="sales-trend__active-layer" aria-hidden="true">
            <line
              class="sales-trend__active-guide"
              :x1="activePoint.x"
              :x2="activePoint.x"
              :y1="chartLayout.top"
              :y2="chartLayout.bottom"
            />
            <circle
              class="sales-trend__active-point sales-trend__active-point--revenue"
              :cx="activePoint.x"
              :cy="activePoint.revenueY"
              r="5.5"
            />
            <circle
              class="sales-trend__active-point sales-trend__active-point--quantity"
              :cx="activePoint.x"
              :cy="activePoint.quantityY"
              r="5"
            />
          </g>

          <g>
            <circle
              v-for="point in chartPoints"
              :key="`revenue-${point.date}`"
              class="sales-trend__point sales-trend__point--revenue"
              :cx="point.x"
              :cy="point.revenueY"
              r="3.4"
            >
              <title>{{ pointTitle(point) }}</title>
            </circle>
            <circle
              v-for="point in chartPoints"
              :key="`quantity-${point.date}`"
              class="sales-trend__point sales-trend__point--quantity"
              :cx="point.x"
              :cy="point.quantityY"
              r="3.2"
            >
              <title>{{ pointTitle(point) }}</title>
            </circle>
          </g>

          <g>
            <rect
              v-for="point in chartPoints"
              :key="`hit-${point.date}`"
              class="sales-trend__hit-area"
              :x="hitAreaX(point)"
              :y="chartLayout.top"
              :width="pointHitWidth"
              :height="plotHeight"
              tabindex="0"
              role="button"
              :aria-label="pointTitle(point)"
              @mouseenter="setActivePoint(point)"
              @focus="setActivePoint(point)"
              @click="setActivePoint(point)"
            />
          </g>

          <g class="sales-trend__axis-layer">
            <text
              v-for="tick in yAxisTicks"
              :key="`left-${tick.ratio}`"
              class="sales-trend__axis-label sales-trend__axis-label--left"
              :x="chartLayout.left - 10"
              :y="tick.y + 4"
              text-anchor="end"
            >
              {{ tick.revenueLabel }}
            </text>
            <text
              v-for="tick in yAxisTicks"
              :key="`right-${tick.ratio}`"
              class="sales-trend__axis-label sales-trend__axis-label--right"
              :x="chartLayout.width - chartLayout.right + 10"
              :y="tick.y + 4"
              text-anchor="start"
            >
              {{ tick.quantityLabel }}
            </text>
            <text
              v-for="label in dateLabels"
              :key="`date-${label.date}`"
              class="sales-trend__axis-label sales-trend__date-label"
              :class="{ 'sales-trend__date-label--mobile-hidden': !label.visibleOnMobile }"
              :x="label.x"
              :y="chartLayout.bottom + 26"
              text-anchor="middle"
            >
              {{ shortDate(label.date) }}
            </text>
          </g>

          <g
            v-if="activePoint && tooltipPosition"
            class="sales-trend__tooltip"
            aria-hidden="true"
          >
            <rect
              class="sales-trend__tooltip-box"
              :x="tooltipPosition.x"
              :y="tooltipPosition.y"
              :width="tooltipPosition.width"
              :height="tooltipPosition.height"
              rx="6"
            />
            <path
              class="sales-trend__tooltip-arrow"
              :d="`M ${tooltipPosition.x + tooltipPosition.arrowX - 7} ${tooltipPosition.y + tooltipPosition.height} L ${tooltipPosition.x + tooltipPosition.arrowX + 7} ${tooltipPosition.y + tooltipPosition.height} L ${tooltipPosition.x + tooltipPosition.arrowX} ${tooltipPosition.y + tooltipPosition.height + 9} Z`"
            />
            <text
              class="sales-trend__tooltip-title"
              :x="tooltipPosition.x + 10"
              :y="tooltipPosition.y + 18"
            >
              {{ activePoint.date }}
            </text>
            <rect class="sales-trend__tooltip-marker sales-trend__tooltip-marker--revenue" :x="tooltipPosition.x + 10" :y="tooltipPosition.y + 30" width="8" height="8" />
            <text class="sales-trend__tooltip-text" :x="tooltipPosition.x + 22" :y="tooltipPosition.y + 38">
              销售额: {{ formatMoney(activePoint.revenue) }}
            </text>
            <rect class="sales-trend__tooltip-marker sales-trend__tooltip-marker--quantity" :x="tooltipPosition.x + 10" :y="tooltipPosition.y + 48" width="8" height="8" />
            <text class="sales-trend__tooltip-text" :x="tooltipPosition.x + 22" :y="tooltipPosition.y + 56">
              销量: {{ formatQuantity(activePoint.quantity) }} 件
            </text>
            <rect class="sales-trend__tooltip-marker sales-trend__tooltip-marker--average" :x="tooltipPosition.x + 10" :y="tooltipPosition.y + 66" width="8" height="8" />
            <text class="sales-trend__tooltip-text" :x="tooltipPosition.x + 22" :y="tooltipPosition.y + 74">
              日均: {{ formatMoney(averageRevenue) }}
            </text>
            <text class="sales-trend__tooltip-emphasis" :x="tooltipPosition.x + 10" :y="tooltipPosition.y + 91">
              {{ averageDeltaText(activePoint) }}
            </text>
          </g>
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sales-trend {
  min-width: 0;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.sales-trend__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.sales-trend__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
}

.sales-trend__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.sales-trend__empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.sales-trend__chart {
  min-width: 0;
  display: grid;
  gap: var(--space-3);
}

.sales-trend__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text);
  font-size: 12px;
}

.sales-trend__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  white-space: nowrap;
}

.sales-trend__legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--color-surface);
}

.sales-trend__legend-dot--revenue {
  border: 2px solid #0ea5e9;
}

.sales-trend__legend-dot--quantity {
  border: 2px solid #16a34a;
}

.sales-trend__legend-line {
  width: 18px;
  border-top: 2px dashed var(--color-warning);
}

.sales-trend__plot {
  min-width: 0;
  overflow: hidden;
}

.sales-trend__svg {
  width: 100%;
  height: auto;
  display: grid;
}

.sales-trend__grid-line {
  stroke: var(--color-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.sales-trend__grid-line--vertical {
  opacity: 0.7;
}

.sales-trend__area {
  pointer-events: none;
}

.sales-trend__line {
  fill: none;
  stroke-width: 2.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.sales-trend__line--revenue {
  stroke: #0ea5e9;
}

.sales-trend__line--quantity {
  stroke: #16a34a;
}

.sales-trend__average-line {
  stroke: var(--color-warning);
  stroke-width: 1.5;
  stroke-dasharray: 7 7;
  vector-effect: non-scaling-stroke;
}

.sales-trend__point {
  fill: var(--color-surface);
  stroke-width: 2.25;
  vector-effect: non-scaling-stroke;
}

.sales-trend__point--revenue {
  stroke: #0ea5e9;
}

.sales-trend__point--quantity {
  stroke: #16a34a;
}

.sales-trend__hit-area {
  fill: transparent;
  cursor: crosshair;
  outline: none;
}

.sales-trend__hit-area:focus-visible {
  stroke: var(--color-primary);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.sales-trend__active-guide {
  stroke: rgb(23 32 51 / 48%);
  stroke-width: 1.25;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
}

.sales-trend__active-point {
  fill: var(--color-surface);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}

.sales-trend__active-point--revenue {
  stroke: #0ea5e9;
}

.sales-trend__active-point--quantity {
  stroke: #16a34a;
}

.sales-trend__tooltip {
  pointer-events: none;
}

.sales-trend__tooltip-box,
.sales-trend__tooltip-arrow {
  fill: rgb(38 38 38 / 94%);
}

.sales-trend__tooltip-title {
  fill: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

.sales-trend__tooltip-text,
.sales-trend__tooltip-emphasis {
  fill: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.sales-trend__tooltip-emphasis {
  fill: #f8fafc;
}

.sales-trend__tooltip-marker--revenue {
  fill: #0ea5e9;
}

.sales-trend__tooltip-marker--quantity {
  fill: #16a34a;
}

.sales-trend__tooltip-marker--average {
  fill: var(--color-warning);
}

.sales-trend__axis-label {
  fill: var(--color-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sales-trend__date-label {
  fill: var(--color-text-soft);
}

@media (max-width: 760px) {
  .sales-trend {
    padding: var(--space-3);
  }

  .sales-trend__legend {
    justify-content: flex-start;
    gap: var(--space-2);
    font-size: 11px;
  }

  .sales-trend__grid-line--mobile-hidden,
  .sales-trend__date-label--mobile-hidden {
    display: none;
  }

  .sales-trend__axis-label {
    font-size: 10px;
  }

  .sales-trend__tooltip-title {
    font-size: 11px;
  }

  .sales-trend__tooltip-text,
  .sales-trend__tooltip-emphasis {
    font-size: 10px;
  }
}
</style>
