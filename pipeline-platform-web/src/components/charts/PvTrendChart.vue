<template>
  <div ref="chartRef" class="chart"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

interface PvRow { hour: string; pv: number; uv: number }

const props = defineProps<{ data: PvRow[] }>()
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }

  const hours = props.data.map(d => d.hour)
  const pvs = props.data.map(d => d.pv)
  const uvs = props.data.map(d => d.uv)

  chart.setOption({
    tooltip: { trigger: 'axis', formatter: (params: any[]) => params.map(p => `${p.seriesName}: ${p.value}`).join('<br/>') },
    legend: { data: ['PV（页面浏览量）', 'UV（独立访客）'] },
    xAxis: { type: 'category', data: hours },
    yAxis: { type: 'value' },
    series: [
      { name: 'PV（页面浏览量）', type: 'line', data: pvs, smooth: true },
      { name: 'UV（独立访客）', type: 'line', data: uvs, smooth: true },
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
