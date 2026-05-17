<script setup lang="ts">
import type { SalesTrendPoint } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  points: readonly SalesTrendPoint[]
  loading?: boolean
}>()

const CHART_WIDTH = 760
const CHART_HEIGHT = 230
const PLOT_TOP = 18
const PLOT_RIGHT = 54
const PLOT_BOTTOM = 194
const PLOT_LEFT = 58
const REVENUE_GRADIENT_ID = 'salesTrendRevenueArea'
const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP

type ChartPoint = {
  date: string
  revenue: number
  quantity: number
  x: number
  revenueY: number
  quantityY: number
}

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
    y: PLOT_TOP + (1 - ratio) * PLOT_HEIGHT,
    revenueLabel: formatMoneyTick(maxRevenue.value * ratio),
    quantityLabel: formatQuantityTick(maxQuantity.value * ratio)
  }))
)

const dateLabels = computed(() => {
  const total = chartPoints.value.length
  const step = total <= 7 ? 1 : Math.ceil(total / 6)
  return chartPoints.value.filter((_, index) => index % step === 0 || index === total - 1)
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

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}

function scaleX(index: number, total: number) {
  if (total <= 1) return PLOT_LEFT + PLOT_WIDTH / 2
  return PLOT_LEFT + (index / (total - 1)) * PLOT_WIDTH
}

function scaleY(value: number, maxValue: number) {
  if (!maxValue) return PLOT_BOTTOM
  return PLOT_TOP + (1 - Math.max(0, value) / maxValue) * PLOT_HEIGHT
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
    `L ${formatCoordinate(last.x)} ${PLOT_BOTTOM}`,
    `L ${formatCoordinate(first.x)} ${PLOT_BOTTOM}`,
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
    <div v-else class="sales-trend__chart" role="img" :aria-label="chartSummary">
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

      <div class="sales-trend__plot">
        <svg
          class="sales-trend__svg"
          :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
          aria-hidden="true"
          focusable="false"
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
              :x1="PLOT_LEFT"
              :x2="CHART_WIDTH - PLOT_RIGHT"
              :y1="tick.y"
              :y2="tick.y"
            />
            <line
              v-for="label in dateLabels"
              :key="`x-${label.date}`"
              class="sales-trend__grid-line sales-trend__grid-line--vertical"
              :x1="label.x"
              :x2="label.x"
              :y1="PLOT_TOP"
              :y2="PLOT_BOTTOM"
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
            :x1="PLOT_LEFT"
            :x2="CHART_WIDTH - PLOT_RIGHT"
            :y1="averageRevenueY"
            :y2="averageRevenueY"
          />
          <path class="sales-trend__line sales-trend__line--revenue" :d="revenueLinePath" />
          <path class="sales-trend__line sales-trend__line--quantity" :d="quantityLinePath" />

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

          <g class="sales-trend__axis-layer">
            <text
              v-for="tick in yAxisTicks"
              :key="`left-${tick.ratio}`"
              class="sales-trend__axis-label sales-trend__axis-label--left"
              :x="PLOT_LEFT - 10"
              :y="tick.y + 4"
              text-anchor="end"
            >
              {{ tick.revenueLabel }}
            </text>
            <text
              v-for="tick in yAxisTicks"
              :key="`right-${tick.ratio}`"
              class="sales-trend__axis-label sales-trend__axis-label--right"
              :x="CHART_WIDTH - PLOT_RIGHT + 10"
              :y="tick.y + 4"
              text-anchor="start"
            >
              {{ tick.quantityLabel }}
            </text>
            <text
              v-for="label in dateLabels"
              :key="`date-${label.date}`"
              class="sales-trend__axis-label sales-trend__date-label"
              :x="label.x"
              :y="PLOT_BOTTOM + 26"
              text-anchor="middle"
            >
              {{ shortDate(label.date) }}
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
  overflow-x: auto;
}

.sales-trend__svg {
  width: 100%;
  min-width: 680px;
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

  .sales-trend__svg {
    min-width: 620px;
  }
}
</style>
