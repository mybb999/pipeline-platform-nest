<template>
  <div class="realtime">
    <el-empty v-if="events.length === 0" description="暂无实时事件" :image-size="80" />
    <el-table v-else :data="events" stripe size="small">
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="event_type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="tagType(row.event_type)" size="small">{{ row.event_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="url" label="页面" show-overflow-tooltip />
      <el-table-column prop="device_type" label="设备" width="80" />
      <el-table-column prop="city" label="城市" width="80" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
interface EventRow { event_type: string; url: string; device_type: string; city: string; created_at: string }

defineProps<{ events: EventRow[] }>()

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tagType(type: string) {
  switch (type) {
    case 'page_view': return ''
    case 'error': return 'danger'
    case 'performance': return 'success'
    default: return 'info'
  }
}
</script>
