<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'

const rows = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const snackbar = ref('')

const sections = computed(() => rows.value.filter((row) => row.type === 'section'))
const items = computed(() => rows.value.filter((row) => row.type === 'item'))

function slug(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await api.getChecklistAdmin()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

function addSection() {
  rows.value.push({
    type: 'section', id: slug('section'), parent_id: '', title: '',
    text: '', sort_order: rows.value.length + 1, active: true,
  })
}

function addItem(sectionId) {
  rows.value.push({
    type: 'item', id: slug('item'), parent_id: sectionId, title: '',
    text: '', sort_order: rows.value.length + 1, active: true,
  })
}

function removeRow(row) {
  const ids = row.type === 'section'
    ? new Set([row.id, ...items.value.filter((item) => item.parent_id === row.id).map((item) => item.id)])
    : new Set([row.id])
  rows.value = rows.value.filter((item) => !ids.has(item.id))
}

async function save() {
  error.value = ''
  if (rows.value.some((row) => !row.title.trim())) {
    error.value = 'กรุณากรอกชื่อหัวข้อให้ครบทุกข้อ'
    return
  }
  if (items.value.some((item) => !sections.value.some((section) => section.id === item.parent_id))) {
    error.value = 'หัวข้อย่อยต้องอยู่ภายใต้หัวข้อใหญ่'
    return
  }
  saving.value = true
  try {
    await api.saveChecklist(rows.value)
    snackbar.value = 'บันทึก Checklist สำเร็จ'
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <div>
        <h1 class="text-h5 font-weight-bold">จัดการ Checklist</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">สำหรับ Admin และ Super Admin · เพิ่มหัวข้อใหญ่และหัวข้อย่อย</p>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="addSection">เพิ่มหัวข้อใหญ่</v-btn>
    </div>

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>
    <v-skeleton-loader v-if="loading" type="article" />

    <template v-else>
      <v-card v-for="section in sections" :key="section.id" variant="outlined" class="mb-4">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="mdi-format-header-1" color="primary" />
          <v-text-field v-model="section.title" label="หัวข้อใหญ่" variant="underlined" hide-details />
          <v-switch v-model="section.active" label="เปิดใช้" color="primary" density="compact" hide-details />
          <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="removeRow(section)" />
        </v-card-title>
        <v-card-text>
          <v-textarea v-model="section.text" label="คำอธิบายหัวข้อใหญ่" variant="outlined" rows="2" auto-grow hide-details class="mb-3" />
          <v-card v-for="item in items.filter((row) => row.parent_id === section.id)" :key="item.id" variant="tonal" class="mb-3">
            <v-card-text>
              <div class="d-flex align-start ga-2">
                <v-text-field v-model="item.title" label="หัวข้อย่อย" variant="outlined" density="compact" hide-details />
                <v-switch v-model="item.active" label="เปิดใช้" color="primary" density="compact" hide-details />
                <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="removeRow(item)" />
              </div>
              <v-textarea v-model="item.text" label="รายละเอียด / วิธีตรวจ" variant="outlined" rows="2" auto-grow hide-details class="mt-3" />
            </v-card-text>
          </v-card>
          <v-btn variant="outlined" size="small" prepend-icon="mdi-plus" @click="addItem(section.id)">เพิ่มหัวข้อย่อย</v-btn>
        </v-card-text>
      </v-card>

      <v-alert v-if="!sections.length" type="info" class="mb-4">ยังไม่มีหัวข้อใหญ่ กดปุ่ม “เพิ่มหัวข้อใหญ่” เพื่อเริ่มต้น</v-alert>
      <v-btn color="primary" size="large" prepend-icon="mdi-content-save" :loading="saving" @click="save">บันทึก Checklist</v-btn>
    </template>

    <v-snackbar v-model="snackbar" timeout="2500" color="success">{{ snackbar }}</v-snackbar>
  </div>
</template>
