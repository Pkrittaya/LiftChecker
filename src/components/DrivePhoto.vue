<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api/client'

const props = defineProps({
  photoUrl: { type: String, default: '' },
})
const emit = defineEmits(['preview'])

const src = ref('')
const loading = ref(true)
const errorMsg = ref('')

// ดึง file id จาก Google Drive url ทุกรูปแบบ
const fileId = computed(() => {
  const u = String(props.photoUrl || '')
  const m = u.match(/id=([a-zA-Z0-9_-]+)/) || u.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m && m[1] ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(u) ? u : '')
})

let cancelled = false

async function load() {
  if (!fileId.value) {
    src.value = ''
    loading.value = false
    errorMsg.value = src.value ? '' : 'รูปไม่พร้อมใช้งาน'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await api.getPhoto(fileId.value)
    if (cancelled) return
    src.value = `data:${data.content_type};base64,${data.base64}`
  } catch (e) {
    if (cancelled) return
    errorMsg.value = e.message
    src.value = ''
  } finally {
    if (!cancelled) loading.value = false
  }
}

watch(() => props.photoUrl, load)
onMounted(() => {
  cancelled = false
  load()
})
onBeforeUnmount(() => {
  cancelled = true
})
</script>

<template>
  <div class="drive-photo">
    <div v-if="loading" class="photo-box">
      <v-progress-circular size="32" indeterminate color="primary" />
    </div>
    <img
      v-else-if="src"
      :src="src"
      alt="ภาพรายงาน"
      class="report-photo"
      @click="$emit('preview', src)"
    />
    <div v-else class="photo-box text-caption text-medium-emphasis">
      {{ errorMsg || 'รูปไม่พร้อมใช้งาน' }}
    </div>
  </div>
</template>

<style scoped>
.photo-box {
  width: 100%;
  max-width: 480px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
}
.report-photo {
  width: 100%;
  max-width: 480px;
  border-radius: 8px;
  cursor: zoom-in;
}
</style>
