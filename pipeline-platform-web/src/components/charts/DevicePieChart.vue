<template>
  <div ref="chartRef" class="chart"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

interface DeviceRow { device: string; count: number }

const props = defineProps<{ data: DeviceRow[] }>()
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }

  // 按设备类型合并（API 返回每行是「某天+某设备」，同设备跨天需累加）
  const labels: Record<string, string> = { desktop: '桌面端', mobile: '手机端', tablet: '平板' }
  const totals = props.data.reduce<Record<string, number>>((acc, d) => {
    acc[d.device] = (acc[d.device] || 0) + d.count
    return acc
  }, {})

  const pieData = Object.entries(totals).map(([device, value]) => ({
    name: labels[device] || '平板',
    value,
  }))

  chart.setOption({
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: pieData,
        label: { show: true, formatter: '{b}: {c}' },
      },
    ],
  })
}

watch(() => props.data, render, { deep: true })
onMounted(render)
onBeforeUnmount(() => chart?.dispose())
</script>

<style scoped>
.chart { width: 100%; height: 300px; }
</style>
