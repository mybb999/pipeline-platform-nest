<template>
  <div class="dashboard">
    <div class="header">
      <el-page-header content="数据大屏" />
      <div class="app-picker">
        <span>当前应用：</span>
        <el-select v-model="selectedAppId" @change="loadData" placeholder="请选择" :loading="loadingApps" style="width:200px">
          <el-option v-for="a in apps" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </div>
    </div>

    <el-empty v-if="!selectedAppId" description="请先在「应用管理」中创建应用" style="margin-top:60px" />

    <template v-else>
      <el-row :gutter="16" style="margin-top:16px">
        <el-col :span="12">
          <el-card header="PV / UV 趋势（近7天）">
            <PvTrendChart :data="pvData" />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card header="设备分布">
            <DevicePieChart :data="deviceData" />
          </el-card>
        </el-col>
      </el-row>

      <el-card header="实时事件流" style="margin-top:16px">
        <RealtimeStream :events="realtimeEvents" />
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { listApps } from '../api/app'
import { getPvTrend, getDeviceDistribution, getRealtimeEvents } from '../api/stats'
import PvTrendChart from '../components/charts/PvTrendChart.vue'
import DevicePieChart from '../components/charts/DevicePieChart.vue'
import RealtimeStream from '../components/RealtimeStream.vue'

interface PvRow { app_id: number; hour: string; pv: number; uv: number }
interface DeviceRow { app_id: number; date: string; device: string; count: number }
interface EventRow { app_id: number; event_type: string; url: string; device_type: string; city: string; created_at: string }
interface AppInfo { id: number; name: string; app_key: string }

const apps = ref<AppInfo[]>([])
const selectedAppId = ref<number>(0)
const loadingApps = ref(false)
const pvData = ref<PvRow[]>([])
const deviceData = ref<DeviceRow[]>([])
const realtimeEvents = ref<EventRow[]>([])
let timer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  loadingApps.value = true
  const res = await listApps()
  apps.value = res.data.data
  loadingApps.value = false
  if (apps.value.length > 0) {
    selectedAppId.value = apps.value[0].id
    await loadData()
    timer = setInterval(() => loadRealtime(), 10000)
  }
})

onBeforeUnmount(() => { if (timer) clearInterval(timer) })

async function loadData() {
  if (!selectedAppId.value) return
  const [pvRes, deviceRes] = await Promise.all([
    getPvTrend(selectedAppId.value, 7),
    getDeviceDistribution(selectedAppId.value),
  ])
  pvData.value = pvRes.data.data
  deviceData.value = deviceRes.data.data
  await loadRealtime()
}

async function loadRealtime() {
  if (!selectedAppId.value) return
  const res = await getRealtimeEvents(selectedAppId.value)
  realtimeEvents.value = res.data.data
}
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.app-picker { display: flex; align-items: center; gap: 12px; }
.app-picker span { font-size: 14px; white-space: nowrap; }
</style>
