<script setup lang="ts">
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions
} from 'chart.js'
import type { SalesTrendPoint } from '~/types/report'
import { formatMoney, formatQuantity } from '~/utils/format'

const props = defineProps<{
  points: readonly SalesTrendPoint[]
  loading?: boolean
}>()

Chart.register(
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
)

const chartCanvas = useTemplateRef<HTMLCanvasElement>('chartCanvas')
const compactChart = shallowRef(false)
let chart: Chart<'line'> | null = null
let compactMediaQuery: MediaQueryList | null = null

const hasTrendData = computed(() =>
  props.points.some(point => (Number(point.revenue) || 0) > 0 || (Number(point.quantity) || 0) > 0)
)

const chartSummary = computed(() => {
  const peak = props.points.reduce<SalesTrendPoint | null>((current, point) => {
    if (!current || Number(point.revenue) > Number(current.revenue)) return point
    return current
  }, null)
  if (!peak) return '销售趋势图'
  return `销售趋势图，最高销售额出现在 ${peak.date}，${formatMoney(Number(peak.revenue) || 0)}，销量 ${formatQuantity(Number(peak.quantity) || 0)} 件`
})

const chartData = computed<ChartData<'line'>>(() => {
  const labels = props.points.map(point => point.date)
  const revenueValues = props.points.map(point => Number(point.revenue) || 0)
  const quantityValues = props.points.map(point => Number(point.quantity) || 0)
  const pointRadius = compactChart.value ? 2.5 : 3.5

  return {
    labels,
    datasets: [
      {
        label: '销售额',
        data: revenueValues,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.16)',
        borderWidth: 2.5,
        fill: true,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#0ea5e9',
        pointBorderWidth: 2,
        pointRadius,
        pointHoverRadius: 5,
        tension: 0.32,
        yAxisID: 'y'
      },
      {
        label: '销量',
        data: quantityValues,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.12)',
        borderWidth: 2.25,
        fill: false,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#16a34a',
        pointBorderWidth: 2,
        pointRadius,
        pointHoverRadius: 5,
        tension: 0.32,
        yAxisID: 'yQuantity'
      }
    ]
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index'
  },
  layout: {
    padding: compactChart.value
      ? { top: 4, right: 4, bottom: 0, left: 0 }
      : { top: 4, right: 10, bottom: 0, left: 4 }
  },
  plugins: {
    legend: {
      position: 'top',
      align: 'center',
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        color: '#172033',
        font: {
          size: compactChart.value ? 10 : 11,
          weight: 600
        },
        padding: compactChart.value ? 10 : 16,
        usePointStyle: true
      }
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(38, 38, 38, 0.94)',
      bodyColor: '#ffffff',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      displayColors: true,
      padding: 10,
      titleColor: '#ffffff',
      titleFont: {
        size: 12,
        weight: 'bold'
      },
      callbacks: {
        label(item) {
          const label = item.dataset.label ?? ''
          const value = Number(item.parsed.y) || 0
          if (item.dataset.yAxisID === 'yQuantity') {
            return `${label}: ${formatQuantity(value)} 件`
          }
          return `${label}: ${formatMoney(value)}`
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(209, 216, 228, 0.72)'
      },
      ticks: {
        autoSkip: false,
        color: '#667085',
        maxRotation: 0,
        minRotation: 0,
        font: {
          size: compactChart.value ? 10 : 11
        },
        callback(value, index) {
          const label = props.points[index]?.date ?? String(value)
          if (!shouldShowDateLabel(index, props.points.length, compactChart.value)) return ''
          return compactChart.value ? shortDate(label) : label
        }
      }
    },
    y: {
      beginAtZero: true,
      border: {
        display: false
      },
      grid: {
        color: 'rgba(209, 216, 228, 0.9)'
      },
      ticks: {
        color: '#667085',
        font: {
          size: compactChart.value ? 10 : 11
        },
        callback(value) {
          return formatMoneyTick(Number(value) || 0)
        }
      }
    },
    yQuantity: {
      beginAtZero: true,
      border: {
        display: false
      },
      grid: {
        drawOnChartArea: false
      },
      position: 'right',
      ticks: {
        color: '#667085',
        font: {
          size: compactChart.value ? 10 : 11
        },
        callback(value) {
          return formatQuantity(Number(value) || 0)
        }
      }
    }
  }
}))

onMounted(() => {
  compactMediaQuery = window.matchMedia('(max-width: 760px)')
  syncCompactChart(compactMediaQuery)
  compactMediaQuery.addEventListener('change', syncCompactChart)
  renderChart()
})

onBeforeUnmount(() => {
  compactMediaQuery?.removeEventListener('change', syncCompactChart)
  chart?.destroy()
  chart = null
})

watch([chartData, chartOptions], () => {
  renderChart()
}, { deep: true, flush: 'post' })

function renderChart() {
  if (!chartCanvas.value || !hasTrendData.value) {
    chart?.destroy()
    chart = null
    return
  }

  if (!chart) {
    chart = new Chart(chartCanvas.value, {
      type: 'line',
      data: chartData.value,
      options: chartOptions.value
    })
    return
  }

  chart.data = chartData.value
  chart.options = chartOptions.value
  chart.update()
}

function syncCompactChart(event: MediaQueryList | MediaQueryListEvent) {
  compactChart.value = event.matches
}

function shouldShowDateLabel(index: number, total: number, compact: boolean) {
  if (total <= 0) return false
  if (compact) {
    if (total <= 4) return true
    return index === 0 || index === Math.floor((total - 1) / 2) || index === total - 1
  }

  if (total <= 7) return true
  const step = Math.ceil(total / 6)
  return index % step === 0 || index === total - 1
}

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}

function formatMoneyTick(value: number) {
  if (value >= 10000) return `¥${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `¥${(value / 1000).toFixed(1)}千`
  return `¥${Math.round(value)}`
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
      <div class="sales-trend__canvas-wrap">
        <canvas ref="chartCanvas" />
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
  overflow: hidden;
}

.sales-trend__canvas-wrap {
  position: relative;
  width: 100%;
  height: 238px;
  min-width: 0;
}

@media (max-width: 760px) {
  .sales-trend {
    padding: var(--space-3);
  }

  .sales-trend__canvas-wrap {
    height: 220px;
  }
}
</style>
