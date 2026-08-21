<script setup>
import { useDisplay } from 'vuetify'
import { useAuthStore } from './stores/auth'
import { useRouter } from 'vue-router'
import { computed, ref } from 'vue'

const { mobile } = useDisplay()
const auth = useAuthStore()
const router = useRouter()
const isDemo = import.meta.env.VITE_DEMO === 'true' || !import.meta.env.VITE_GAS_URL
const showDemoBanner = ref(true)

const links = computed(() => {
  const base = [
    { name: 'lifts', label: 'รายการลิฟท์', icon: 'mdi-elevator-passenger' },
    { name: 'scan', label: 'สแกน QR', icon: 'mdi-qrcode-scan' },
  ]
  if (auth.user?.role === 'admin' || auth.user?.role === 'super_admin') {
    base.push({ name: 'users', label: 'จัดการผู้ใช้', icon: 'mdi-account-group' })
    base.push({ name: 'checklist-admin', label: 'จัดการ Checklist', icon: 'mdi-format-list-checks' })
  }
  return base
})

const current = computed(() => router.currentRoute.value.name)

function go(name) {
  router.push({ name })
}

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <v-app>
    <v-app-bar app color="primary" :elevation="2">
      <v-app-bar-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-elevator-passenger" />
        <span class="font-weight-bold">บันทึกลิฟท์</span>
      </v-app-bar-title>
      <template v-if="auth.isAuthenticated">
        <span class="d-none d-sm-flex mr-2 text-body-2">{{ auth.displayName }}</span>
        <v-btn icon="mdi-logout" @click="logout" :aria-label="'ออกจากระบบ'" />
      </template>
    </v-app-bar>

    <v-main>
      <v-alert
        v-if="isDemo && showDemoBanner"
        type="info"
        variant="tonal"
        class="ma-2 mb-0 demo-banner"
      >
        <div class="d-flex align-center">
          <div>
            <b>โหมด Demo</b> — ใช้ข้อมูลจำลองเท่านั้น ห้ามใช้โหมดนี้ใน production
          </div>
          <v-spacer />
          <v-btn size="small" variant="text" @click="showDemoBanner = false">ปิด</v-btn>
        </div>
      </v-alert>
      <v-container fluid class="pb-16">
        <router-view />
      </v-container>
    </v-main>

    <v-bottom-navigation
      v-if="auth.isAuthenticated && mobile"
      app
      grow
      :value="current"
      color="primary"
    >
      <v-btn v-for="link in links" :key="link.name" :value="link.name" @click="go(link.name)">
        <v-icon :icon="link.icon" />
        <span>{{ link.label }}</span>
      </v-btn>
    </v-bottom-navigation>

    <v-navigation-drawer v-if="auth.isAuthenticated && !mobile" app permanent>
      <v-list>
        <v-list-item
          v-for="link in links"
          :key="link.name"
          :active="current === link.name"
          @click="go(link.name)"
        >
          <template #prepend>
            <v-icon :icon="link.icon" />
          </template>
          <v-list-item-title>{{ link.label }}</v-list-item-title>
        </v-list-item>
      </v-list>
      <template #append>
        <v-list-item @click="logout">
          <template #prepend>
            <v-icon icon="mdi-logout" />
          </template>
          <v-list-item-title>ออกจากระบบ</v-list-item-title>
        </v-list-item>
      </template>
    </v-navigation-drawer>
  </v-app>
</template>
