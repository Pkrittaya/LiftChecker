<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { QrcodeStream } from 'vue-qrcode-reader'
import { api } from '../api/client'

const router = useRouter()
const hasCamera = ref(false)
const cameraError = ref('')
const scanning = ref(true)
const lifting = ref(false)
const notFound = ref('')
const manualInput = ref('')
const lifts = ref([])
const selecting = ref(false)

onMounted(async () => {
  try {
    await api.getLifts()
  } catch {}
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    if (devices.some((d) => d.kind === 'videoinput')) {
      hasCamera.value = true
    }
  } catch {
    hasCamera.value = false
  }

  loadingLifts()
})

function loadingLifts() {
  selecting.value = true
  api
    .getLifts()
    .then((list) => {
      lifts.value = list
    })
    .catch(() => {})
    .finally(() => {
      selecting.value = false
    })
}

function handleError(e) {
  cameraError.value = e?.name || String(e)
  scanning.value = false
}

function findLift(code) {
  notFound.value = ''
  const text = String(code).trim()
  const id = text.includes('/lift/') ? text.split('/lift/')[1] : text
  const lift = lifts.value.find(
    (l) => l.id === id || l.qr_data === text || l.id === text.split('/').pop(),
  )
  if (lift) {
    router.push({ name: 'lift-detail', params: { id: lift.id } })
  } else {
    notFound.value = `ไม่พบลิฟท์รหัส "${text}"`
  }
}

function onDetect(detectedCodes) {
  if (!scanning.value || lifting.value) return
  const code = detectedCodes?.[0]?.rawValue
  if (!code) return
  lifting.value = true
  scanning.value = false
  findLift(code)
  setTimeout(() => {
    lifting.value = false
  }, 1500)
}

onBeforeUnmount(() => {
  scanning.value = false
})

function goLift(id) {
  router.push({ name: 'lift-detail', params: { id } })
}
</script>

<template>
  <div>
    <h1 class="text-h5 font-weight-bold mb-1">สแกน QR code เพื่อค้นหาลิฟท์</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      สแกน QR ที่ติดอยู่ที่ตัวลิฟท์เพื่อเข้าไปดูรายละเอียดและเพิ่มรายงาน
    </p>

    <v-card variant="outlined" class="mb-4" max-width="560">
      <div v-if="hasCamera && !cameraError" class="scan-wrap">
        <QrcodeStream
          :paused="!scanning"
          torch
          @detect="onDetect"
          @error="handleError"
          @camera-on="scanning = true"
          class="scan-stream"
        />
        <div class="scan-overlay">
          <div class="scan-frame" />
          <div class="scan-line" />
        </div>
        <v-chip v-if="lifting" class="scan-status" color="primary">กำลังค้นหา...</v-chip>
      </div>
      <v-alert v-else-if="cameraError" type="warning" class="ma-4">
        ไม่สามารถเปิดกล้องได้ ({{ cameraError }}) กรุณาใช้ช่องค้นหาด้วยรหัสด้านล่าง และให้สิทธิ์กล้องในเบราว์เซอร์
      </v-alert>
      <v-alert v-else type="info" class="ma-4">
        ไม่พบกล้องบนอุปกรณ์นี้ กรุณาใช้ช่องค้นหาด้วยรหัสลิฟท์ด้านล่าง
      </v-alert>
    </v-card>

    <v-alert v-if="notFound" type="error" class="mb-4">{{ notFound }}</v-alert>

    <v-card variant="tonal" class="mb-4" max-width="560">
      <v-card-title class="text-subtitle-1">ค้นหาด้วยรหัสลิฟท์</v-card-title>
      <v-card-text>
        <v-form
          @submit.prevent="manualInput.trim() && goLift(manualInput.trim())"
        >
          <div class="d-flex ga-2">
            <v-text-field
              v-model="manualInput"
              label="รหัสลิฟท์ เช่น LIFT-0001"
              hide-details
              variant="outlined"
              density="compact"
            />
            <v-btn type="submit" color="primary" height="40">ไป</v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>

    <h2 class="text-subtitle-1 font-weight-bold mt-6 mb-2">หรือเลือกจากรายการ</h2>
    <v-skeleton-loader v-if="selecting" type="list-item" :items="5" />
    <v-list v-else lines="two" max-width="560">
      <v-list-item
        v-for="lift in lifts"
        :key="lift.id"
        :title="lift.name"
        :subtitle="`${lift.id} · ${lift.building || '-'} ${lift.location || ''}`"
        prepend-icon="mdi-elevator-passenger"
        color="primary"
        @click="goLift(lift.id)"
      >
        <template #append>
          <v-icon icon="mdi-chevron-right" />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<style scoped>
.scan-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background: #000;
  min-height: 280px;
}
.scan-stream {
  width: 100%;
  height: auto;
  display: block;
}
.scan-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scan-frame {
  width: 65%;
  aspect-ratio: 1;
  border: 3px solid rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
}
.scan-line {
  position: absolute;
  width: 65%;
  height: 3px;
  background: #4f8ef7;
  box-shadow: 0 0 12px #4f8ef7;
  animation: scan 2.2s ease-in-out infinite;
}
@keyframes scan {
  0% {
    top: 18%;
  }
  50% {
    top: 80%;
  }
  100% {
    top: 18%;
  }
}
.scan-status {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
}
</style>