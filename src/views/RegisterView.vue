<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'

const router = useRouter()

const formRef = ref(null)

const name = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const required = (v) => Boolean(v) || 'กรุณากรอก'
const usernameRule = (v) => (v && v.length >= 3) || 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร'
const passwordRule = (v) => (v && v.length >= 12) || 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร'
const confirmRule = (v) => v === password.value || 'รหัสผ่านไม่ตรงกัน'

async function submit() {
  error.value = ''
  const valid = await formRef.value?.validate()
  if (!valid) return
  loading.value = true
  try {
    await api.register({
      username: username.value,
      password: password.value,
      name: name.value,
      role: 'user',
    })
    router.push({ name: 'login', query: { registered: '1' } })
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-row class="d-flex justify-center align-center" style="min-height: 70vh">
    <v-col cols="12" sm="6" md="5">
      <v-card elevation="4" class="pa-6">
        <div class="text-center mb-4">
          <v-icon size="48" color="primary" icon="mdi-account-plus" />
          <h1 class="text-h5 font-weight-bold mt-2">สมัครสมาชิก</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">
            สมัครสมาชิก (สิทธิเริ่มต้นเป็นผู้ใช้ทั่วไป) เมื่อเป็น admin แล้วจัดการสิทธิได้ที่หน้า "จัดการผู้ใช้"
          </p>
        </div>

        <v-form ref="formRef" :disabled="loading" @submit.prevent="submit">
          <v-text-field
            v-model="name"
            label="ชื่อ-นามสกุล (ชื่อแสดง)"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            :rules="[required]"
          />
          <v-text-field
            v-model="username"
            label="ชื่อผู้ใช้"
            prepend-inner-icon="mdi-account-key"
            variant="outlined"
            autocomplete="username"
            :rules="[required, usernameRule]"
          />
          <v-text-field
            v-model="password"
            label="รหัสผ่าน"
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            autocomplete="new-password"
            :rules="[required, passwordRule]"
            @click:append-inner="showPassword = !showPassword"
          />
          <v-text-field
            v-model="confirmPassword"
            label="ยืนยันรหัสผ่าน"
            prepend-inner-icon="mdi-lock-check"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            autocomplete="new-password"
            :rules="[required, confirmRule]"
          />

          <v-alert v-if="error" type="error" density="compact" class="mb-2">
            {{ error }}
          </v-alert>

          <v-btn type="submit" color="primary" block size="large" :loading="loading" class="mt-2">
            สมัครสมาชิก
          </v-btn>
          <div class="text-center mt-3">
            <router-link to="/login" class="text-body-2">มีบัญชีแล้ว · เข้าสู่ระบบ</router-link>
          </div>
        </v-form>
      </v-card>
    </v-col>
  </v-row>
</template>
