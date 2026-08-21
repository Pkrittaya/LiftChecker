<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import DrivePhoto from '../components/DrivePhoto.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const lift = ref(null)
const reports = ref([])
const loading = ref(true)
const loadReportsLoading = ref(true)
const error = ref('')
const qrDataUrl = ref('')
const insideQrDataUrl = ref('')
const photoPreview = ref(null)
const downloading = ref(false)

const liftId = computed(() => route.params.id)

// แยก URL หลายรูป (คั่นด้วย comma / space) -> ส่งให้ <DrivePhoto> ดึงผ่าน Apps Script (base64)
// เพื่อเลี่ยง Google Drive hotlink + rate-limit (429)

function photoArray(photoUrl) {
  if (!photoUrl) return []
  return String(photoUrl)
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((u) => u.trim())
}

function statusColor(status) {
  if (status === 'ปกติ') return 'success'
  if (status === 'ชำรุด') return 'error'
  if (status === 'กำลังซ่อม') return 'warning'
  return 'grey'
}

const qrContent = computed(() => {
  const origin = window.location.origin
  return `${origin}/lifts/${encodeURIComponent(liftId.value)}`
})
const insideQrContent = computed(() => lift.value?.inside_qr_data || `${liftId.value}-INSIDE`)

async function loadLift() {
  loading.value = true
  error.value = ''
  try {
    lift.value = await api.getLift(liftId.value)
    QRCode.toDataURL(qrContent.value, { width: 240, margin: 1 })
      .then((url) => {
        qrDataUrl.value = url
      })
      .catch(() => {})
    QRCode.toDataURL(insideQrContent.value, { width: 240, margin: 1 })
      .then((url) => {
        insideQrDataUrl.value = url
      })
      .catch(() => {})
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadReports() {
  loadReportsLoading.value = true
  try {
    reports.value = await api.getReports(liftId.value)
  } catch {
    reports.value = []
  } finally {
    loadReportsLoading.value = false
  }
}

onMounted(() => {
  loadLift()
  loadReports()
})

function goReport() {
  router.push({ name: 'lift-report', params: { id: liftId.value } })
}

function formatDate(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

async function downloadPhoto(url) {
  downloading.value = true
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-${liftId.value}.jpg`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon variant="text" @click="router.push({ name: 'lifts' })">
        <v-icon icon="mdi-arrow-left" />
      </v-btn>
      <h1 class="text-h5 font-weight-bold">รายละเอียดลิฟท์</h1>
    </div>

    <v-skeleton-loader v-if="loading" type="article" />

    <v-alert v-else-if="error" type="error" class="mb-4">{{ error }}</v-alert>

    <template v-else-if="lift">
      <v-card variant="outlined" class="mb-4">
        <v-card-item>
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="56">
              <v-icon icon="mdi-elevator-passenger" size="28" />
            </v-avatar>
          </template>
          <v-card-title class="text-h6 font-weight-bold">{{ lift.name }}</v-card-title>
          <v-card-subtitle class="text-body-2">{{ lift.id }}</v-card-subtitle>
          <template #append>
           <v-chip :color="statusColor(lift.last_status)" label>
              {{ lift.last_status || 'ไม่เคยรายงาน' }}
            </v-chip>
          </template>
         </v-card-item>
        <v-divider />
        <v-list density="compact">
          <v-list-item title="อาคาร" :subtitle="lift.building || '-'">
            <template #prepend><v-icon icon="mdi-office-building" /></template>
          </v-list-item>
          <v-list-item title="ตำแหน่ง" :subtitle="lift.location || '-'">
            <template #prepend><v-icon icon="mdi-map-marker" /></template>
          </v-list-item>
          <v-list-item title="จำนวนชั้น" :subtitle="String(lift.floor_count ?? '-')">
            <template #prepend><v-icon icon="mdi-layers" /></template>
          </v-list-item>
        </v-list>
        <v-divider />
        <v-card-text class="text-center">
           <p class="text-body-2 text-medium-emphasis mb-2">QR code ของลิฟท์นี้ (เก็บไว้พิมพ์ติดที่ตัวลิฟท์)</p>
           <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR" width="160" class="qr-img" />
           <p class="text-caption text-medium-emphasis mt-2 break-all">{{ qrContent }}</p>
           <v-divider class="my-4" />
           <p class="text-body-2 text-medium-emphasis mb-2">QR ภายในลิฟท์</p>
           <img v-if="insideQrDataUrl" :src="insideQrDataUrl" alt="QR ภายในลิฟท์" width="160" class="qr-img" />
           <p class="text-caption text-medium-emphasis mt-2 break-all">{{ insideQrContent }}</p>
        </v-card-text>
      </v-card>

      <div class="d-flex align-center mb-3">
        <h2 class="text-subtitle-1 font-weight-bold">รายงานลิฟท์</h2>
        <v-spacer />
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="goReport"
        >
          เพิ่มรายงาน
        </v-btn>
      </div>

      <v-skeleton-loader v-if="loadReportsLoading" type="list-item-two-line" :items="3" />

      <v-alert v-else-if="reports.length === 0" type="info" class="mb-4">
        ยังไม่มีรายงาน กด "เพิ่มรายงาน" เพื่อบันทึกข้อมูลลิฟท์
      </v-alert>

      <v-card
        v-for="report in reports"
        :key="report.id"
        variant="outlined"
        class="mb-3"
      >
        <v-card-item>
          <template #prepend>
            <v-icon
               :icon="report.process_status === 'ดำเนินการแล้ว' ? 'mdi-check-circle' : 'mdi-progress-clock'"
               :color="report.process_status === 'ดำเนินการแล้ว' ? 'success' : 'warning'"
              size="32"
            />
          </template>
          <v-card-title class="text-subtitle-2 font-weight-bold">
             {{ report.process_status || 'กำลังดำเนินการ' }}
          </v-card-title>
          <v-card-subtitle class="text-caption">
            {{ formatDate(report.created_at) }}
            <span v-if="report.reported_by"> · {{ report.reported_by }}</span>
          </v-card-subtitle>
           <template #append>
             <div class="d-flex align-center ga-2">
               <v-chip :color="report.process_status === 'ดำเนินการแล้ว' ? 'success' : 'warning'" size="small" label>
                 {{ report.process_status || 'กำลังดำเนินการ' }}
               </v-chip>
                <v-btn
                  v-if="report.reported_by === auth.displayName || ['admin', 'super_admin'].includes(auth.user?.role)"
                 icon="mdi-pencil-outline"
                 size="small"
                 variant="text"
                 title="แก้ไขรายงาน"
                 @click="router.push({ name: 'lift-report-edit', params: { id: liftId, reportId: report.id } })"
               />
             </div>
           </template>
        </v-card-item>
         <v-card-text v-if="report.notes" class="text-body-2">{{ report.notes }}</v-card-text>
         <v-card-text v-if="report.process_status" class="pt-0">
           <v-chip :color="report.process_status === 'ดำเนินการแล้ว' ? 'success' : 'warning'" size="small" label>
             {{ report.process_status }}
           </v-chip>
           <div class="text-caption text-medium-emphasis mt-2">
             QR ด้านหน้า: {{ report.front_scanned_by || '-' }} · QR ภายใน: {{ report.inside_scanned_by || '-' }}
           </div>
         </v-card-text>
         <v-card-text v-if="report.checklist?.length" class="pt-0">
           <div class="text-subtitle-2 font-weight-bold mb-1">ผลตรวจเช็คลิฟท์</div>
           <v-list density="compact" class="pa-0">
             <v-list-item v-for="item in report.checklist" :key="item.id" class="px-0">
               <template #prepend>
                 <v-icon
                   :icon="item.result === 'ผ่าน' ? 'mdi-check-circle' : item.result === 'ไม่ผ่าน' ? 'mdi-close-circle' : 'mdi-minus-circle'"
                   :color="item.result === 'ผ่าน' ? 'success' : item.result === 'ไม่ผ่าน' ? 'error' : 'grey'"
                   class="mr-2"
                 />
               </template>
               <v-list-item-title>{{ item.title }}</v-list-item-title>
               <v-list-item-subtitle>
                 {{ item.result }}<span v-if="item.note"> · {{ item.note }}</span>
               </v-list-item-subtitle>
             </v-list-item>
           </v-list>
         </v-card-text>
         <v-card-text v-if="report.photo_url" class="pt-0">
          <DrivePhoto
            v-for="u in photoArray(report.photo_url)"
            :key="u"
            :photo-url="u"
            class="d-inline-block mr-2"
            @preview="photoPreview = $event"
          />
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="photoPreview" max-width="640">
      <v-card>
        <v-toolbar color="primary">
          <v-toolbar-title class="text-subtitle-1">ภาพรายงาน</v-toolbar-title>
          <v-btn icon="mdi-download" :loading="downloading" @click="downloadPhoto(photoPreview)" />
          <v-btn icon="mdi-close" @click="photoPreview = null" />
        </v-toolbar>
        <img :src="photoPreview" alt="" style="width: 100%; display: block" />
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.qr-img {
  background: #fff;
  padding: 6px;
  border-radius: 8px;
}
.report-photo {
  width: 100%;
  max-width: 480px;
  border-radius: 8px;
  cursor: zoom-in;
}
.break-all {
  word-break: break-all;
}
</style>
