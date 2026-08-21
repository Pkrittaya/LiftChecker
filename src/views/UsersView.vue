<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const users = ref([])
const loading = ref(true)
const error = ref('')
const snackbar = ref('')
const saving = ref('') // username ที่กำลัง change role
const deleting = ref('') // username ที่กำลังลบ
const confirmDelete = ref(null)
const editDialog = ref(false)
const editTarget = ref(null) // ซึ่งกำลังแก้
const editForm = ref({ username: '', name: '', role: 'user', password: '' })
const editError = ref('')
const editLoading = ref(false)

const isSuper = computed(() => auth.user?.role === 'super_admin')

function roleLabel(role) {
  if (role === 'super_admin') return 'Super Admin'
  return role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'
}

// admin จัดการได้แค่ user / super admin จัดการได้ทุกอย่างยกเว้น super_admin กับตัวเอง
function canManage(user) {
  if (!user || user.role === 'super_admin') return false
  if (isSuper.value) return user.username !== auth.user?.username
  return user.role === 'user'
}

const roleOptions = computed(() => {
  const opts = [{ title: 'ผู้ใช้ทั่วไป', value: 'user' }]
  if (isSuper.value) opts.push({ title: 'ผู้ดูแลระบบ', value: 'admin' })
  return opts
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    users.value = await api.listUsers()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function changeRole(user, role) {
  saving.value = user.username
  error.value = ''
  try {
    users.value = await api.setUserRole(user.username, role)
    snackbar.value = `เปลี่ยนสิทธิ "${user.username}" เป็น ${role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'} สำเร็จ`
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = ''
  }
}

async function doDelete(user) {
  deleting.value = user.username
  error.value = ''
  try {
    users.value = await api.deleteUser(user.username)
    confirmDelete.value = null
    snackbar.value = `ลบผู้ใช้ "${user.username}" สำเร็จ`
  } catch (e) {
    error.value = e.message
  } finally {
    deleting.value = ''
  }
}

function roleLabelOld(role) {
  return role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'
}

function openEdit(user) {
  editForm.value = {
    username: user.username,
    name: user.name || '',
    role: user.role,
    password: '',
  }
  editTarget.value = user
  editError.value = ''
  editDialog.value = true
}

async function saveEdit() {
  editError.value = ''
  const f = editForm.value
  if (!f.username || f.username.length < 3) {
    editError.value = 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร'
    return
  }
  if (f.password && f.password.length < 12) {
    editError.value = 'รหัสผ่านต้องอย่างน้อย 12 ตัวอักษร'
    return
  }
  editLoading.value = true
  try {
    const canChangeRole =
      isSuper.value && editTarget.value.username !== auth.user?.username
    const payload = {
      username: f.username,
      name: f.name,
      ...(canChangeRole ? { role: f.role } : {}),
      ...(f.password ? { password: f.password } : {}),
    }
    users.value = await api.editUser(editTarget.value.username, payload)
    editDialog.value = false
    snackbar.value = `แก้ไขผู้ใช้ "${editTarget.value.username}" สำเร็จ`
    if (editTarget.value.username === auth.user?.username) {
      const newRole = canChangeRole ? f.role : auth.user?.role
      auth.user = { ...auth.user, username: f.username, name: f.name, role: newRole }
      localStorage.setItem('user', JSON.stringify(auth.user))
    }
  } catch (e) {
    editError.value = e.message
  } finally {
    editLoading.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <div>
        <h1 class="text-h5 font-weight-bold">จัดการผู้ใช้</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">ผู้ดูแลระบบเท่านั้น · เปลี่ยนแปลงสิทธิได้</p>
      </div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-account-plus" to="/register">
        สร้างผู้ใช้
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>

    <v-skeleton-loader v-if="loading" type="list-item-three-line" :items="4" />

    <v-card v-else-if="users.length" variant="outlined" max-width="720">
      <v-list v-for="user in users" :key="user.username" :lines="false">
        <v-divider v-if="user !== users[0]" />
        <v-list-item>
          <template #prepend>
            <v-avatar :color="user.role === 'super_admin' ? 'orange-darken-2' : 'primary'" variant="tonal">
              <v-icon :icon="user.role === 'super_admin' ? 'mdi-shield-crown' : user.role === 'admin' ? 'mdi-shield-account' : 'mdi-account'" />
            </v-avatar>
          </template>
          <v-list-item-title class="font-weight-medium">{{ user.name || user.username }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ user.username }}
            <v-chip v-if="user.username === auth.user?.username" size="x-small" color="primary" class="ml-1">
              คุณ
            </v-chip>
            <v-chip v-if="user.role === 'super_admin'" size="x-small" color="orange-darken-2" class="ml-1">
              Super Admin
            </v-chip>
          </v-list-item-subtitle>
          <template #append>
            <div class="d-flex align-center ga-2">
              <v-select
                :model-value="user.role"
                :items="roleOptions"
                :disabled="!canManage(user) || saving === user.username"
                :loading="saving === user.username"
                variant="outlined"
                density="compact"
                hide-details
                width="140"
                @update:model-value="(role) => changeRole(user, role)"
              />
              <v-tooltip v-if="canManage(user)" text="แก้ไขข้อมูลผู้ใช้">
                <template #activator="{ props }">
                  <v-btn
                    icon="mdi-pencil-outline"
                    size="small"
                    variant="text"
                    v-bind="props"
                    @click="openEdit(user)"
                  />
                </template>
              </v-tooltip>
              <v-tooltip v-if="canManage(user)" text="ลบผู้ใช้">
                <template #activator="{ props }">
                  <v-btn
                    icon="mdi-trash-can-outline"
                    size="small"
                    variant="text"
                    color="error"
                    :disabled="deleting === user.username"
                    :loading="deleting === user.username"
                    v-bind="props"
                    @click="confirmDelete = user"
                  />
                </template>
              </v-tooltip>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-empty v-else-if="!loading" title="ไม่มีผู้ใช้" text="ยังไม่มีข้อมูลผู้ใช้ในระบบ" />

    <v-dialog v-model="confirmDelete" max-width="420">
      <v-card v-if="confirmDelete">
        <v-card-title class="text-body-1 font-weight-bold">ลบผู้ใช้ "{{ confirmDelete.username }}"?</v-card-title>
        <v-card-text class="text-body-2">
          ผู้ใช้ <b>{{ confirmDelete.name || confirmDelete.username }}</b> จะถูกลบออกจากระบบ และไม่สามารถเข้าสู่ระบบได้อีก
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDelete = null">ยกเลิก</v-btn>
          <v-btn color="error" :loading="deleting === confirmDelete.username" @click="doDelete(confirmDelete)">
            ยืนยันลบ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="editDialog" max-width="480" persistent>
      <v-card v-if="editTarget">
        <v-card-title class="text-body-1 font-weight-bold">
          แก้ไขผู้ใช้ "{{ editTarget.username }}"
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="editForm.name"
            label="ชื่อ-นามสกุล (ชื่อแสดง)"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-text-field
            v-model="editForm.username"
            label="ชื่อผู้ใช้"
            prepend-inner-icon="mdi-account-key"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-select
            v-model="editForm.role"
            :items="roleOptions"
            label="สิทธิการใช้งาน"
            prepend-inner-icon="mdi-shield-account"
            variant="outlined"
            hide-details
            :disabled="!isSuper"
            :hint="!isSuper ? 'เฉพาะ super admin เท่านั้นที่เปลี่ยนสิทธิได้' : ''"
            persistent-hint
            class="mb-3"
          />
          <v-text-field
            v-model="editForm.password"
            label="รหัสผ่านใหม่ (เว้นว่างถ้าไม่ต้องการเปลี่ยน)"
            prepend-inner-icon="mdi-lock-reset"
            variant="outlined"
            type="password"
            hide-details
          />
          <v-alert v-if="editError" type="error" density="compact" class="mt-3">
            {{ editError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false" :disabled="editLoading">ยกเลิก</v-btn>
          <v-btn color="primary" :loading="editLoading" @click="saveEdit">บันทึก</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" timeout="2500" color="success">
      {{ snackbar }}
    </v-snackbar>
  </div>
</template>
