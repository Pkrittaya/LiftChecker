<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { QrcodeStream } from 'vue-qrcode-reader'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import DrivePhoto from '../components/DrivePhoto.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const lift = ref(null)
const loadingLift = ref(true)
const liftError = ref('')
const checklist = ref([])
const checklistLoading = ref(true)
const checklistGroups = computed(() => {
  const groups = []
  const byId = new Map()
  checklist.value.forEach((item) => {
    const id = item.group_id || 'default'
    if (!byId.has(id)) {
      const group = { id, title: item.group_title || 'รายการตรวจลิฟท์', items: [] }
      byId.set(id, group)
      groups.push(group)
    }
    byId.get(id).items.push(item)
  })
  return groups
})

const notes = ref('')
const photos = ref([])
const existingPhotos = ref([])
const fileInput = ref(null)
const submitting = ref(false)
const error = ref('')
const MAX_FILE_BYTES = 5 * 1024 * 1024
const hasCamera = ref(false)
const cameraError = ref('')
const scanning = ref(true)
const cameraEnabled = ref(false)
const scanMode = ref('front')
const scanMessage = ref('')
const frontScan = ref({ at: '', by: '' })
const insideScan = ref({ at: '', by: '' })
const savedReportId = ref('')
const savedProcessStatus = ref('')
const savedReportedBy = ref('')
const draftSaving = ref(false)

const checklistComplete = computed(() => checklist.value.length > 0 && checklist.value.every((item) => {
  return item.result && (item.result !== 'ไม่ผ่าน' || String(item.note || '').trim())
}))
const processStatus = computed(() => frontScan.value.at && insideScan.value.at && checklistComplete.value
  ? 'ดำเนินการแล้ว'
  : 'กำลังดำเนินการ')
const isAdmin = computed(() => ['admin', 'super_admin'].includes(auth.user?.role))
const isOwner = computed(() => savedReportedBy.value === auth.displayName)
const canEditReport = computed(() => isAdmin.value || isOwner.value)
const isReportCompleted = computed(() => savedProcessStatus.value === 'ดำเนินการแล้ว')
const isReadOnly = computed(() => isReportCompleted.value && !isAdmin.value)
const scanLabel = computed(() => scanMode.value === 'front' ? 'QR ด้านหน้าลิฟท์' : 'QR ภายในลิฟท์')

const liftId = route.params.id
const reportId = String(route.params.reportId || '')
const isEditing = Boolean(reportId)

onMounted(async () => {
  if (isEditing) savedReportId.value = reportId
  const [liftResult, checklistResult] = await Promise.allSettled([
    api.getLift(liftId),
    api.getChecklist(),
  ])
  if (liftResult.status === 'fulfilled') lift.value = liftResult.value
  else liftError.value = liftResult.reason?.message || 'โหลดข้อมูลลิฟท์ไม่สำเร็จ'
  if (checklistResult.status === 'fulfilled') {
    checklist.value = checklistResult.value.map((item) => ({ ...item, result: '', note: '' }))
  } else {
    error.value = checklistResult.reason?.message || 'โหลดรายการตรวจไม่สำเร็จ'
  }
  if (isEditing) {
    try {
      const report = await api.getReport(reportId)
      savedProcessStatus.value = report.process_status || ''
      savedReportedBy.value = report.reported_by || ''
      notes.value = report.notes || ''
      existingPhotos.value = report.photo_url ? String(report.photo_url).split(/[,,\s]+/).filter(Boolean) : []
      frontScan.value = { at: report.front_scanned_at || '', by: report.front_scanned_by || '' }
      insideScan.value = { at: report.inside_scanned_at || '', by: report.inside_scanned_by || '' }
      checklist.value = checklist.value.map((item) => {
        const saved = (report.checklist || []).find((entry) => entry.id === item.id)
        return { ...item, result: saved?.result || '', note: saved?.note || '' }
      })
      if (frontScan.value.at && !insideScan.value.at) scanMode.value = 'inside'
      if (frontScan.value.at && insideScan.value.at) {
        scanMode.value = ''
        scanning.value = false
      }
      if (isReportCompleted.value && !isAdmin.value) {
        error.value = 'ไม่สามารถแก้ไขรายงานที่ดำเนินการแล้วได้ (เฉพาะ Admin เท่านั้น)'
        setTimeout(() => {
          router.replace({ name: 'lift-detail', params: { id: liftId } })
        }, 2000)
        return
      }
    } catch (e) {
      error.value = e.message
    }
  }
  loadingLift.value = false
  checklistLoading.value = false
  try {
    hasCamera.value = (await navigator.mediaDevices.enumerateDevices()).some((device) => device.kind === 'videoinput')
  } catch {
    hasCamera.value = false
  }
})

function qrCodeText(raw) {
  const text = String(raw || '').trim()
  return text.split('/').filter(Boolean).pop() || text
}

async function acceptScan(raw) {
  const value = String(raw || '').trim()
  const code = qrCodeText(value)
  const now = new Date().toISOString()
  const by = auth.displayName || auth.user?.username || ''
  const frontCode = String(lift.value?.qr_data || liftId)
  const insideCode = String(lift.value?.inside_qr_data || `${liftId}-INSIDE`)
  const frontMatches = value === frontCode || code === frontCode || code === liftId
  const insideMatches = value === insideCode
    || code === insideCode
    || value === `INSIDE:${liftId}`
    || code === `INSIDE:${liftId}`

  if (frontMatches && !frontScan.value.at) {
    frontScan.value = { at: now, by }
    scanMessage.value = insideScan.value.at
      ? 'สแกน QR ครบทั้ง 2 จุดแล้ว'
      : 'สแกน QR ด้านหน้าแล้ว กรุณาสแกน QR ภายในลิฟท์'
  } else if (insideMatches && !insideScan.value.at) {
    insideScan.value = { at: now, by }
    scanMessage.value = frontScan.value.at
      ? 'สแกน QR ครบทั้ง 2 จุดแล้ว'
      : 'สแกน QR ภายในแล้ว กรุณาสแกน QR ด้านหน้าลิฟท์'
  } else {
    scanMessage.value = 'QR นี้ไม่ใช่ QR ที่ต้องสแกนของลิฟท์ตัวนี้ หรือสแกนจุดนี้ไปแล้ว'
    return
  }

  if (frontScan.value.at && insideScan.value.at) {
    scanMode.value = ''
    scanning.value = false
  } else {
    scanMode.value = frontScan.value.at ? 'inside' : 'front'
  }
}

function onQrDetect(codes) {
  if (!scanning.value || !scanMode.value) return
  const raw = codes?.[0]?.rawValue
  if (raw) acceptScan(raw)
}

function handleCameraError(e) {
  cameraError.value = e?.name || String(e)
  scanning.value = false
}

function resetScans() {
  frontScan.value = { at: '', by: '' }
  insideScan.value = { at: '', by: '' }
  scanMode.value = 'front'
  scanMessage.value = ''
  scanning.value = true
  cameraEnabled.value = true
}

function toggleCamera() {
  cameraEnabled.value = !cameraEnabled.value
}

async function saveScanProgress() {
  if (submitting.value || draftSaving.value) return
  draftSaving.value = true
  try {
    const existingId = savedReportId.value || reportId
    const payload = {
      lift_id: liftId,
      ...(existingId ? { id: existingId } : {}),
      notes: notes.value,
      checklist: checklist.value,
      process_status: processStatus.value,
      front_scanned_at: frontScan.value.at,
      front_scanned_by: frontScan.value.by,
      inside_scanned_at: insideScan.value.at,
      inside_scanned_by: insideScan.value.by,
    }
    const report = existingId
      ? await api.updateReport(payload)
      : await api.createReport(payload)
    if (!savedReportId.value && report?.id) savedReportId.value = report.id
    if (report?.process_status) savedProcessStatus.value = report.process_status
  } catch (e) {
    error.value = `บันทึกข้อมูลการสแกนไม่สำเร็จ: ${e.message}`
  } finally {
    draftSaving.value = false
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function isBlankImage(dataUrl) {
  try {
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = dataUrl
    })
    const w = Math.min(img.naturalWidth || 1, 600)
    const h = Math.min(img.naturalHeight || 1, 600)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, w, h)
    const d = ctx.getImageData(0, 0, w, h).data
    let blank = 0
    let total = w * h
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]
      if (a < 200) blank++
      else if (d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228) blank++
    }
    return blank / total > 0.9
  } catch {
    return false
  }
}

async function onFilesSelected(e) {
  const files = e.target.files || []
  const remaining = 4 - existingPhotos.value.length - photos.value.length
  for (const file of Array.from(files).slice(0, remaining)) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > MAX_FILE_BYTES) {
      error.value = 'รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป'
      continue
    }
    photos.value.push(await readFileAsDataURL(file))
  }
  e.target.value = ''
}

function removePhoto(i) {
  photos.value.splice(i, 1)
}

function removeExistingPhoto(i) {
  existingPhotos.value.splice(i, 1)
}

function openCamera() {
  fileInput.value?.click()
}

async function submit() {
  if (submitting.value || draftSaving.value) return
  error.value = ''
  submitting.value = true
  try {
    if (!canEditReport.value && (isEditing || savedReportId.value) && processStatus.value === 'ดำเนินการแล้ว' && savedProcessStatus.value === 'ดำเนินการแล้ว') {
      router.replace({ name: 'lift-detail', params: { id: liftId } })
      return
    }
    for (let i = 0; i < photos.value.length; i++) {
      const blank = await isBlankImage(photos.value[i])
      if (blank) {
        submitting.value = false
        error.value = `รูปที่ ${i + 1} ดูว่างเปล่าหรือขาวเกินไป (ภาพโปร่งใส/ไม่มีเนื้อหา) กรุณาถ่ายใหม่ด้วยกล้องจริง แล้วลองอีกครั้ง`
        return
      }
    }
    const payload = {
      lift_id: liftId,
      ...((isEditing || savedReportId.value) ? { id: reportId || savedReportId.value } : {}),
      notes: notes.value,
      photos: photos.value,
      ...((isEditing || savedReportId.value) ? { keep_photo_urls: existingPhotos.value } : {}),
      checklist: checklist.value,
      process_status: processStatus.value,
      front_scanned_at: frontScan.value.at,
      front_scanned_by: frontScan.value.by,
      inside_scanned_at: insideScan.value.at,
      inside_scanned_by: insideScan.value.by,
    }
    const report = isEditing || savedReportId.value
      ? await api.updateReport(payload)
      : await api.createReport(payload)
    if (report?.process_status) savedProcessStatus.value = report.process_status
    router.replace({ name: 'lift-detail', params: { id: liftId } })
    return report
  } catch (e) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon variant="text" @click="router.push({ name: 'lift-detail', params: { id: liftId } })">
        <v-icon icon="mdi-arrow-left" />
      </v-btn>
       <h1 class="text-h5 font-weight-bold">{{ isEditing ? 'แก้ไขรายงานลิฟท์' : 'เพิ่มรายงานลิฟท์' }}</h1>
    </div>

    <v-skeleton-loader v-if="loadingLift" type="list-item" />
    <v-alert v-else-if="liftError" type="error" class="mb-4">{{ liftError }}</v-alert>

    <v-alert v-if="lift" type="info" density="compact" class="mb-4">
      <b>{{ lift.name }}</b> ({{ lift.id }}) · {{ lift.building || '-' }} {{ lift.location || '' }}
    </v-alert>

    <v-alert v-if="isReadOnly && isEditing" type="warning" density="compact" class="mb-4">
      รายงานนี้ดำเนินการแล้ว คุณไม่มีสิทธิ์แก้ไข (เฉพาะ Admin เท่านั้น)
    </v-alert>

    <v-card variant="outlined" class="mb-4" max-width="640">
      <v-card-title class="text-subtitle-1 font-weight-bold">1. สแกน QR ประจำจุด</v-card-title>
      <v-card-text>
        <v-row dense class="mb-2">
          <v-col cols="12" sm="6">
            <v-alert :type="frontScan.at ? 'success' : 'warning'" density="compact">
              <b>ด้านหน้าลิฟท์</b><br />
              {{ frontScan.at ? `สแกนแล้วโดย ${frontScan.by || '-'}` : 'ยังไม่ได้สแกน' }}
            </v-alert>
          </v-col>
          <v-col cols="12" sm="6">
            <v-alert :type="insideScan.at ? 'success' : 'warning'" density="compact">
              <b>ภายในลิฟท์</b><br />
              {{ insideScan.at ? `สแกนแล้วโดย ${insideScan.by || '-'}` : 'ยังไม่ได้สแกน' }}
            </v-alert>
          </v-col>
        </v-row>
        <v-alert :type="processStatus === 'ดำเนินการแล้ว' ? 'success' : 'info'" density="compact" class="mb-3">
          สถานะการตรวจ: <b>{{ processStatus }}</b>
          <span v-if="draftSaving" class="ml-2">กำลังบันทึก...</span>
        </v-alert>
        <div v-if="hasCamera && !cameraError && scanMode" class="mb-3">
          <v-btn
            v-if="scanMode"
            :prepend-icon="cameraEnabled ? 'mdi-camera-off' : 'mdi-camera'"
            :color="cameraEnabled ? 'error' : 'primary'"
            variant="outlined"
            size="small"
            class="mb-2"
            @click="toggleCamera"
          >
            {{ cameraEnabled ? 'ปิดกล้อง' : 'เปิดกล้อง' }}
          </v-btn>
          <div v-if="cameraEnabled" class="scan-wrap">
            <QrcodeStream :paused="!scanning" @detect="onQrDetect" @error="handleCameraError" class="scan-stream" />
            <div class="scan-overlay"><div class="scan-frame" /></div>
            <v-chip class="scan-status" color="primary">กำลังรอ {{ scanLabel }}</v-chip>
          </div>
          <v-alert v-else type="info" density="compact" class="mt-2">
            กล้องปิดอยู่ กรุณากรอกรหัสด้วยตนเอง หรือกดเปิดกล้องอีกครั้งเพื่อสแกน QR
          </v-alert>
        </div>
        <v-alert v-else-if="cameraError" type="warning" density="compact" class="mb-3">
          ไม่สามารถเปิดกล้องได้ กรุณากรอกรหัส QR ด้วยตนเอง
        </v-alert>
        <v-text-field
          v-if="scanMode"
          label="กรอกรหัส QR ด้วยตนเอง"
          placeholder="เช่น LIFT-0001 หรือ LIFT-0001-INSIDE"
          variant="outlined"
          density="compact"
          hide-details
          @keyup.enter="acceptScan($event.target.value)"
        />
        <v-alert v-if="scanMessage" type="info" density="compact" class="mt-2">{{ scanMessage }}</v-alert>
        <v-btn v-if="(frontScan.at || insideScan.at) && !isReadOnly" variant="text" size="small" class="mb-2" @click="resetScans">
          เริ่มสแกนใหม่
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card v-if="checklist.length || checklistLoading" variant="outlined" class="mb-4" max-width="640">
      <v-card-title class="text-subtitle-1 font-weight-bold">2. แบบตรวจเช็คลิฟท์</v-card-title>
      <v-card-text>
        <v-skeleton-loader v-if="checklistLoading" type="list-item-three-line" :items="3" />
        <div v-else>
          <v-alert :type="checklistComplete ? 'success' : 'warning'" density="compact" class="mb-3">
            สถานะแบบตรวจ:
            <b>{{ checklistComplete ? 'เลือกครบทุกข้อแล้ว' : 'ยังเลือกผลตรวจไม่ครบทุกข้อ' }}</b>
          </v-alert>
          <div v-for="group in checklistGroups" :key="group.id" class="check-group">
            <div class="text-subtitle-2 font-weight-bold">{{ group.title }}</div>
            <div v-for="(item, index) in group.items" :key="item.id" class="check-item">
              <div class="text-body-1 font-weight-medium">{{ index + 1 }}. {{ item.title }}</div>
              <div class="text-body-2 text-medium-emphasis mb-1">{{ item.text }}</div>
              <v-radio-group v-model="item.result" inline density="compact" hide-details :disabled="isReadOnly">
                <v-radio label="ผ่าน" value="ผ่าน" color="success" />
                <v-radio label="ไม่ผ่าน" value="ไม่ผ่าน" color="error" />
              </v-radio-group>
              <v-textarea
                v-if="item.result === 'ไม่ผ่าน'"
                v-model="item.note"
                label="หมายเหตุ: โปรดระบุสาเหตุที่ไม่ผ่าน"
                placeholder="เช่น ประตูปิดไม่สนิท มีเสียงดัง หรือไฟไม่ติด"
                variant="outlined"
                rows="2"
                auto-grow
                counter="500"
                maxlength="500"
                hide-details="auto"
                class="mt-2"
              />
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-4" max-width="640">
      <v-card-title class="text-subtitle-1 font-weight-bold">3. รูปถ่ายลิฟท์</v-card-title>
      <v-card-text>
        <v-alert v-if="isEditing && existingPhotos.length" type="info" density="compact" class="mb-3">
          รูปเดิมสามารถลบได้ และสามารถเพิ่มรูปใหม่ได้ รวมไม่เกิน 4 รูป
        </v-alert>
        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-card v-for="(photo, i) in existingPhotos" :key="`existing-${photo}`" class="photo-item" variant="outlined">
            <DrivePhoto :photo-url="photo" class="existing-photo-preview" />
            <v-btn v-if="!isReadOnly" icon="mdi-close" size="x-small" class="photo-remove" @click="removeExistingPhoto(i)" />
          </v-card>
          <v-card v-for="(photo, i) in photos" :key="i" class="photo-item" variant="outlined">
            <img :src="photo" alt="รูป" class="photo-preview" />
            <v-btn v-if="!isReadOnly" icon="mdi-close" size="x-small" class="photo-remove" @click="removePhoto(i)" />
          </v-card>

           <v-sheet
             v-if="existingPhotos.length + photos.length < 4 && !isReadOnly"
            class="photo-add"
            color="grey-lighten-4"
            rounded="lg"
            @click="openCamera"
            style="cursor: pointer"
          >
            <v-icon icon="mdi-camera" size="32" />
            <div class="text-caption mt-1">ถ่ายรูป / เลือกรูป</div>
          </v-sheet>
        </div>

         <input
           ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          @change="onFilesSelected"
        />
         <p class="text-caption text-medium-emphasis mb-0">ถ่ายได้สูงสุด 4 รูป</p>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-4" max-width="640">
      <v-card-title class="text-subtitle-1 font-weight-bold">4. หมายเหตุ</v-card-title>
      <v-card-text>
        <v-textarea
          v-model="notes"
          label="รายละเอียด / อาการที่พบ"
          rows="3"
          variant="outlined"
          counter
          maxlength="1000"
          hint="เช่น เสียงผิดปกติ ประตูเปิดไม่สนิท ฯลฯ"
          :readonly="isReadOnly"
        />
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" class="mb-4" max-width="640">{{ error }}</v-alert>

    <div class="d-flex gap-2" style="max-width: 640px">
      <v-btn
        variant="outlined"
        size="large"
        @click="router.push({ name: 'lift-detail', params: { id: liftId } })"
      >
        {{ isReadOnly ? 'กลับ' : 'ยกเลิก' }}
      </v-btn>
      <v-btn
        v-if="!isReadOnly"
        color="primary"
        size="large"
        :loading="submitting"
        prepend-icon="mdi-content-save"
        @click="submit"
      >
         {{ isEditing ? 'บันทึกการแก้ไข' : 'บันทึกรายงาน' }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.photo-item {
  position: relative;
}
.photo-preview {
  width: 104px;
  height: 104px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.existing-photo-preview {
  width: 104px;
  height: 104px;
}
.photo-remove {
  position: absolute;
  top: 4px;
  right: 4px;
}
.photo-add {
  width: 104px;
  height: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(0, 0, 0, 0.2);
}
.gap-2 {
  gap: 0.5rem !important;
}
.check-item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.check-group + .check-group {
  margin-top: 16px;
}
.check-item:last-child {
  border-bottom: 0;
}
.scan-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: #000;
  min-height: 240px;
}
.scan-stream {
  width: 100%;
  display: block;
}
.scan-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.scan-frame {
  width: 58%;
  aspect-ratio: 1;
  border: 3px solid rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.42);
}
.scan-status {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
