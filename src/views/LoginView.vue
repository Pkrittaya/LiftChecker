<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const successMsg = route.query.registered ? 'สมัครสมาชิกสำเร็จ ลองเข้าสู่ระบบได้เลย' : ''

async function submit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/lifts'
    router.push(redirect)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-row class="d-flex justify-center align-center" style="min-height: 70vh">
    <v-col cols="12" sm="6" md="4">
      <v-card elevation="4" class="pa-6">
        <div class="text-center mb-6">
          <v-icon size="64" color="primary" icon="mdi-elevator-passenger" />
          <h1 class="text-h5 font-weight-bold mt-4">ระบบบันทึกลิฟท์</h1>
          <p class="text-body-2 text-medium-emphasis">เข้าสู่ระบบเพื่อใช้งาน</p>
        </div>

        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="username"
            label="ชื่อผู้ใช้"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            autocomplete="username"
            :disabled="loading"
          />
          <v-text-field
            v-model="password"
            label="รหัสผ่าน"
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            autocomplete="current-password"
            :disabled="loading"
            @click:append-inner="showPassword = !showPassword"
          />

          <v-alert v-if="successMsg" type="success" density="compact" class="mb-2">
            {{ successMsg }}
          </v-alert>
          <v-alert v-if="error" type="error" density="compact" class="mb-2">
            {{ error }}
          </v-alert>

          <v-btn
            type="submit"
            color="primary"
            block
            size="large"
            :loading="loading"
            class="mt-2"
          >
            เข้าสู่ระบบ
          </v-btn>
        </v-form>
      </v-card>
    </v-col>
  </v-row>
</template>
