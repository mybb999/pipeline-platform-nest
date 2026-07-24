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

  const pieData = props.data.map(d => ({
    name: d.device === 'desktop' ? '桌面端' : d.device === 'mobile' ? '手机端' : '平板',
    value: d.count,
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
