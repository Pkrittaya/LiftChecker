// ตั้งค่า Apps Script Web App URL ที่นี่ (ดูวิธีตั้งค่าใน README)
// ถ้า VITE_DEMO=true หรือยังไม่ตั้ง VITE_GAS_URL จะกลับเข้าโหมด demo (ข้อมูลจำลอง)
import { demoApi } from './demo'

const GAS_URL = import.meta.env.VITE_GAS_URL || ''
const DEMO_MODE = import.meta.env.VITE_DEMO === 'true' || !GAS_URL

async function request(path, options = {}) {
  if (DEMO_MODE) throw new Error('โหมด demo')
  const { method = 'GET', params, body } = options
  let url = `${GAS_URL}?endpoint=${encodeURIComponent(path)}`

  const query = { ...(params || {}) }
  const token = localStorage.getItem('token')
  // แนบ auth_token ทาง query ทุก method (Apps Script บาง deploy อ่าน token เฉพาะ query)
  if (token && path !== '/login' && path !== '/register') {
    query.auth_token = token
  }
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  if (qs) url += '&' + qs

  let response
  try {
    response = await fetch(url, {
      method,
      // ใช้ text/plain เพื่อเลี่ยง preflight (CORS) ของ Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body !== undefined
        ? JSON.stringify(token && path !== '/login' ? { ...body, auth_token: token } : body)
        : undefined,
    })
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้')
  }

  let data
  const raw = await response.text()
  try {
    data = JSON.parse(raw)
  } catch {
    data = { message: raw }
  }

  if (!response.ok || data.error) {
    throw new Error(data.message || `เกิดข้อผิดพลาด (${response.status})`)
  }
  return data.data
}

export default request

export const api = {
  login: (username, password) =>
    DEMO_MODE ? demoApi.login(username, password) : request('/login', { method: 'POST', body: { username, password } }),
  register: (payload) =>
    DEMO_MODE ? demoApi.register(payload) : request('/register', { method: 'POST', body: payload }),
  listUsers: () => (DEMO_MODE ? demoApi.listUsers() : request('/users')),
  setUserRole: (username, role) =>
    DEMO_MODE ? demoApi.setUserRole(username, role) : request('/users', { method: 'POST', body: { action: 'role', target: username, role } }),
  editUser: (username, payload) =>
    DEMO_MODE ? demoApi.editUser(username, payload) : request('/users', { method: 'POST', body: { action: 'edit', target: username, ...payload } }),
  deleteUser: (username) =>
    DEMO_MODE ? demoApi.deleteUser(username) : request('/users', { method: 'POST', body: { action: 'delete', target: username } }),
  getLifts: () => (DEMO_MODE ? demoApi.getLifts() : request('/lifts')),
  getChecklist: () => (DEMO_MODE ? demoApi.getChecklist() : request('/checklist')),
  getChecklistAdmin: () => (DEMO_MODE ? demoApi.getChecklistAdmin() : request('/checklist-admin')),
  saveChecklist: (rows) => (DEMO_MODE ? demoApi.saveChecklist(rows) : request('/checklist-admin', { method: 'POST', body: { rows } })),
  getLift: (id) => (DEMO_MODE ? demoApi.getLift(id) : request('/lifts', { params: { id } })),
  getReports: (liftId) =>
    DEMO_MODE ? demoApi.getReports(liftId) : request('/reports', { params: { lift_id: liftId } }),
  getReport: (id) =>
    DEMO_MODE ? demoApi.getReport(id) : request('/reports', { params: { id } }),
  createReport: (payload) =>
    DEMO_MODE ? demoApi.createReport(payload) : request('/reports', { method: 'POST', body: payload }),
  updateReport: (payload) =>
    DEMO_MODE ? demoApi.updateReport(payload) : request('/reports', { method: 'POST', body: { ...payload, action: 'update' } }),
  getPhoto: (fileId) =>
    DEMO_MODE ? Promise.reject(new Error('โหมด demo ไม่มีรูปจริง')) : request('/photo', { params: { id: fileId } }),
}
