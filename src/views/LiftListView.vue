<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'

const router = useRouter()
const lifts = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lifts.value
  return lifts.value.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q) ||
      (l.building || '').toLowerCase().includes(q) ||
      (l.location || '').toLowerCase().includes(q),
  )
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    lifts.value = await api.getLifts()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

function statusColor(status) {
  if (status === 'ปกติ') return 'success'
  if (status === 'ชำรุด') return 'error'
  if (status === 'กำลังซ่อม') return 'warning'
  return 'grey'
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <div>
        <h1 class="text-h5 font-weight-bold">รายการลิฟท์</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">ทั้งหมด {{ lifts.length }} ตัว</p>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-qrcode-scan" to="/scan">
        สแกน QR
      </v-btn>
    </div>

    <v-text-field
      v-model="search"
      label="ค้นหา (ชื่อ / รหัสลิฟท์ / อาคาร / ตำแหน่ง)"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="comfortable"
      hide-details
      class="mb-4"
    />

    <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <v-skeleton-loader v-if="loading" type="list-item-three-line" :items="6" />

    <v-row v-else-if="lifts.length" dense>
      <v-col v-for="lift in filtered" :key="lift.id" cols="12" sm="6" md="4">
        <v-card
          variant="outlined"
          class="lift-card"
          @click="router.push({ name: 'lift-detail', params: { id: lift.id } })"
        >
          <v-card-item>
            <template #prepend>
              <v-avatar color="primary" variant="tonal">
                <v-icon icon="mdi-elevator-passenger" />
              </v-avatar>
            </template>
            <v-card-title class="text-subtitle-1 font-weight-bold">
              {{ lift.name }}
            </v-card-title>
            <v-card-subtitle class="text-caption">
              {{ lift.id }} · {{ lift.building || '-' }} {{ lift.location || '' }}
            </v-card-subtitle>
            <template #append>
              <v-chip :color="statusColor(lift.last_status)" size="small" label>
                {{ lift.last_status || 'ไม่เคยรายงาน' }}
              </v-chip>
            </template>
          </v-card-item>
          <v-card-text class="text-caption text-medium-emphasis">
            จำนวนชั้น: {{ lift.floor_count || '-' }}
            <span v-if="lift.last_reported_at"> · ล่าสุด: {{ lift.last_reported_at }}</span>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div v-if="!loading && !error && lifts.length === 0" class="text-center mt-8">
      <v-icon icon="mdi-elevator-passenger" size="48" color="grey-lighten-1" />
      <p class="text-body-1 text-medium-emphasis mt-2">ยังไม่มีข้อมูลลิฟท์</p>
    </div>
    <div v-if="filtered.length === 0 && lifts.length > 0" class="text-center mt-8">
      <p class="text-body-1 text-medium-emphasis">ไม่พบลิฟท์ที่ค้นหา</p>
    </div>
  </div>
</template>

<style scoped>
.lift-card {
  cursor: pointer;
}
</style>