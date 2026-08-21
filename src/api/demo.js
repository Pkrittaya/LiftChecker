// โหมด Demo: จำลองข้อมูลแทน Google Sheets เพื่อให้เทสต์ UI ได้โดยไม่ต้องตั้ง backend
// เปิดใช้งานเมื่อ VITE_DEMO=true หรือ VITE_GAS_URL ว่าง

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms))

const DEMO_USERS_KEY = 'demo-lift-users'

function getDemoUsers() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]')
  } catch {
    return []
  }
}

const DEMO_LIFTS = [
  {
    id: 'LIFT-0001',
    name: 'ลิฟท์อาคาร A ฝั่งหน้า',
    building: 'อาคาร A',
    location: 'ชั้น 1',
    floor_count: 8,
     qr_data: 'LIFT-0001',
     inside_qr_data: 'LIFT-0001-INSIDE',
    last_status: 'ปกติ',
    last_reported_at: '2026-08-19 09:30',
  },
  {
    id: 'LIFT-0002',
    name: 'ลิฟท์อาคาร B ฝั่งหลัง',
    building: 'อาคาร B',
    location: 'ชั้น 1',
    floor_count: 5,
     qr_data: 'LIFT-0002',
     inside_qr_data: 'LIFT-0002-INSIDE',
    last_status: 'กำลังซ่อม',
    last_reported_at: '2026-08-18 14:05',
  },
  {
    id: 'LIFT-0003',
    name: 'ลิฟท์หอพัก C',
    building: 'หอพัก C',
    location: 'ชั้น G',
    floor_count: 12,
     qr_data: 'LIFT-0003',
     inside_qr_data: 'LIFT-0003-INSIDE',
    last_status: 'ชำรุด',
    last_reported_at: '2026-08-17 10:45',
  },
]

// เก็บรายงาน demo ไว้ใน localStorage เพื่อให้ข้อมูลอยู่ข้ามการ reload
const DEMO_REPORTS_KEY = 'demo-lift-reports'

const DEMO_CHECKLIST = [
  { id: 'door', group_id: 'operation-safety', group_title: 'การทำงานและความปลอดภัย', title: 'ประตูลิฟท์', text: 'ประตูเปิดและปิดสนิท ไม่ติดขัด และไม่มีเสียงผิดปกติ', sort_order: 2 },
  { id: 'floor-level', group_id: 'operation-safety', group_title: 'การทำงานและความปลอดภัย', title: 'การจอดตรงชั้น', text: 'ลิฟท์จอดเสมอระดับพื้น ไม่สูงหรือต่ำกว่าพื้นชั้นมากเกินไป', sort_order: 3 },
  { id: 'button', group_id: 'operation-safety', group_title: 'การทำงานและความปลอดภัย', title: 'ปุ่มกดและไฟแสดงผล', text: 'ปุ่มกดทุกชั้น ปุ่มเปิดประตู และไฟแสดงผลทำงานครบถ้วน', sort_order: 4 },
  { id: 'ride', group_id: 'operation-safety', group_title: 'การทำงานและความปลอดภัย', title: 'การเคลื่อนที่', text: 'ลิฟท์เคลื่อนที่นุ่มนวล ไม่มีอาการกระตุก สั่น หรือหยุดผิดปกติ', sort_order: 5 },
  { id: 'safety', group_id: 'operation-safety', group_title: 'การทำงานและความปลอดภัย', title: 'ระบบความปลอดภัย', text: 'เซนเซอร์ประตูและระบบหยุดฉุกเฉินทำงาน ไม่มีสิ่งกีดขวางบริเวณประตู', sort_order: 6 },
  { id: 'display', group_id: 'condition-equipment', group_title: 'สภาพแวดล้อมและอุปกรณ์', title: 'จอแสดงชั้นและทิศทาง', text: 'จอแสดงชั้น ลูกศรขึ้นลง และเสียงแจ้งชั้นทำงานถูกต้อง', sort_order: 8 },
  { id: 'lighting', group_id: 'condition-equipment', group_title: 'สภาพแวดล้อมและอุปกรณ์', title: 'ไฟส่องสว่างและพัดลม', text: 'ไฟภายในห้องโดยสารและพัดลมระบายอากาศทำงานปกติ', sort_order: 9 },
  { id: 'alarm', group_id: 'condition-equipment', group_title: 'สภาพแวดล้อมและอุปกรณ์', title: 'สัญญาณฉุกเฉิน', text: 'ปุ่มกริ่งฉุกเฉิน โทรศัพท์ หรือระบบสื่อสารฉุกเฉินพร้อมใช้งาน', sort_order: 10 },
  { id: 'cleanliness', group_id: 'condition-equipment', group_title: 'สภาพแวดล้อมและอุปกรณ์', title: 'ความสะอาดและสภาพภายใน', text: 'พื้น ผนัง กระจก ราวจับ และแผงควบคุมสะอาด ไม่มีความเสียหายชัดเจน', sort_order: 11 },
  { id: 'signage', group_id: 'condition-equipment', group_title: 'สภาพแวดล้อมและอุปกรณ์', title: 'ป้ายและอุปกรณ์ประจำลิฟท์', text: 'ป้ายบอกน้ำหนัก จำนวนผู้โดยสาร และอุปกรณ์ฉุกเฉินอยู่ครบถ้วน', sort_order: 12 },
]

function seedReports() {
  const stored = localStorage.getItem(DEMO_REPORTS_KEY)
  if (stored) return JSON.parse(stored)
  const reports = [
    {
      id: 'R20260801-0001',
      lift_id: 'LIFT-0001',
      status: 'ปกติ',
      notes: 'ตรวจเช็คประจำเดือน ทำงานปกติ',
      photo_url: '',
      reported_by: 'Admin',
      reported_by_username: 'admin',
      created_at: '2026-08-19T09:30:00.000Z',
    },
    {
      id: 'R20260801-0002',
      lift_id: 'LIFT-0002',
      status: 'กำลังซ่อม',
      notes: 'ประตูเปิดช้า รอช่างแจ้งซ่อม',
      photo_url: '',
      reported_by: 'Admin',
      reported_by_username: 'admin',
      created_at: '2026-08-18T14:05:00.000Z',
    },
    {
      id: 'R20260801-0003',
      lift_id: 'LIFT-0003',
      status: 'ชำรุด',
      notes: 'ลิฟท์ค้างระหว่างชั้น มีเสียงผิดปกติ งดใช้งาน',
      photo_url: '',
      reported_by: 'Admin',
      reported_by_username: 'admin',
      created_at: '2026-08-17T10:45:00.000Z',
    },
  ]
  localStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify(reports))
  return reports
}

function getReports() {
  return seedReports()
}

function saveReports(reports) {
  localStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify(reports))
}

function getLastReportStatus(liftId) {
  const reports = getReports()
    .filter((r) => r.lift_id === liftId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const last = reports[reports.length - 1]
  if (!last) return null
    return {
      status: last.process_status || last.status,
    reported_at: new Date(last.created_at).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  }
}

export const demoApi = {
  async login(username, password) {
    await delay(500)
    if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
    const users = getDemoUsers()
    const match = users.find((u) => u.username === username)
    if (match) {
      if (match.password !== password) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      return {
        token: 'demo-token-' + Date.now(),
        user: { username, name: match.name || username, role: match.role || 'user' },
      }
    }
    // Demo only: ad-hoc accounts are regular users, never administrators.
    if (password.length < 12) throw new Error('โหมด Demo ต้องใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร')
    const role = 'user'
    return {
      token: 'demo-token-' + Date.now(),
      user: { username, name: username === 'superadmin' ? 'Super Admin' : username, role },
    }
  },

  async register(payload) {
    await delay(500)
    const username = (payload.username || '').trim()
    const password = String(payload.password || '')
    const users = getDemoUsers()
    if (username.length < 3) throw new Error('ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร')
    if (password.length < 12) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร')
    if (users.some((u) => u.username === username)) throw new Error('ชื่อผู้ใช้ "' + username + '" ถูกใช้แล้ว')
    const user = {
      username,
      password,
      name: payload.name || username,
      role: 'user',
    }
    users.push(user)
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
    return { username: user.username, name: user.name, role: user.role }
  },

  async listUsers() {
    await delay()
    return getDemoUsers().map((u) => ({ username: u.username, name: u.name, role: u.role }))
  },

  async setUserRole(username, role) {
    await delay()
    const me = JSON.parse(localStorage.getItem('user') || 'null')
    if (me && me.username === username) throw new Error('ไม่สามารถเปลี่ยนสิทธิของบัญชีตัวเองได้')
    const users = getDemoUsers()
    const u = users.find((x) => x.username === username)
    if (!u) throw new Error('ไม่พบผู้ใช้ ' + username)
    const isSuper = me?.role === 'super_admin'
    if (u.role === 'super_admin') throw new Error('บัญชี super admin จัดการได้จาก Google Sheet เท่านั้น')
    if (me?.role === 'admin' && u.role !== 'user') throw new Error('admin แก้ไขสิทธิ admin ไม่ได้')
    if (role === 'admin' && !isSuper) throw new Error('เฉพาะ super admin เท่านั้นที่ตั้งสิทธิ admin ได้')
    u.role = role === 'admin' && isSuper ? 'admin' : 'user'
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
    return this.listUsers()
  },

  async editUser(username, payload) {
    await delay()
    const me = JSON.parse(localStorage.getItem('user') || 'null')
    const users = getDemoUsers()
    const u = users.find((x) => x.username === username)
    if (!u) throw new Error('ไม่พบผู้ใช้ ' + username)
    const isSuper = me?.role === 'super_admin'
    if (u.role === 'super_admin') throw new Error('บัญชี super admin จัดการได้จาก Google Sheet เท่านั้น')
    if (me?.role === 'admin' && u.role !== 'user') throw new Error('admin แก้ไขสิทธิ admin ไม่ได้')
    const newName = payload.name !== undefined ? String(payload.name).trim() : u.name
    const newRole = payload.role !== undefined ? payload.role : u.role
    const newUsername = payload.username !== undefined ? String(payload.username).trim() : username
    if (newUsername.length < 3) throw new Error('ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร')
    if (payload.password && String(payload.password).length < 12) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร')
    if (newUsername !== username && users.some((x) => x.username === newUsername)) throw new Error('ชื่อผู้ใช้ "' + newUsername + '" ถูกใช้แล้ว')
    if (me && me.username === username) throw new Error('ไม่สามารถเปลี่ยนสิทธิของบัญชีตัวเองได้')
    if (newRole === 'admin' && !isSuper) throw new Error('เฉพาะ super admin เท่านั้นที่ตั้งสิทธิ admin ได้')
    u.name = newName
    if (newRole) u.role = isSuper ? (newRole === 'admin' ? 'admin' : 'user') : 'user'
    if (payload.password) u.password = String(payload.password)
    if (newUsername !== username) {
      u.username = newUsername
      users.splice(users.indexOf(u), 1)
      users.push(u)
    }
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
    return this.listUsers()
  },

  async deleteUser(username) {
    await delay()
    const me = JSON.parse(localStorage.getItem('user') || 'null')
    if (me && me.username === username) throw new Error('ไม่สามารถลบบัญชีตัวเองได้')
    const users = getDemoUsers()
    const idx = users.findIndex((x) => x.username === username)
    if (idx === -1) throw new Error('ไม่พบผู้ใช้ ' + username)
    if (users[idx].role === 'super_admin') throw new Error('บัญชี super admin จัดการได้จาก Google Sheet เท่านั้น')
    if (me?.role === 'admin' && users[idx].role !== 'user') throw new Error('admin แก้ไขสิทธิ admin ไม่ได้')
    users.splice(idx, 1)
    localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
    return this.listUsers()
  },

  async getLifts() {
    await delay()
    return DEMO_LIFTS.map((l) => {
      const last = getLastReportStatus(l.id)
      return {
        ...l,
        last_status: last?.status || null,
        last_reported_at: last?.reported_at || null,
      }
    })
  },

  async getLift(id) {
    await delay()
    const lifts = await this.getLifts()
    const lift = lifts.find((l) => l.id === id)
    if (!lift) throw new Error('ไม่พบลิฟท์รหัส ' + id)
    return lift
  },

  async getChecklist() {
    await delay()
    return DEMO_CHECKLIST
  },

  async getChecklistAdmin() {
    await delay()
    return [
      { type: 'section', id: 'operation-safety', parent_id: '', title: 'การทำงานและความปลอดภัย', text: 'ตรวจสอบการทำงานหลักและระบบความปลอดภัยของลิฟท์', sort_order: 1, active: true },
      ...DEMO_CHECKLIST.filter((item) => item.group_id === 'operation-safety').map((item) => ({ ...item, type: 'item', parent_id: item.group_id, active: true })),
      { type: 'section', id: 'condition-equipment', parent_id: '', title: 'สภาพแวดล้อมและอุปกรณ์', text: 'ตรวจสอบสภาพภายใน อุปกรณ์แสดงผล และอุปกรณ์ฉุกเฉิน', sort_order: 7, active: true },
      ...DEMO_CHECKLIST.filter((item) => item.group_id === 'condition-equipment').map((item) => ({ ...item, type: 'item', parent_id: item.group_id, active: true })),
    ]
  },

  async saveChecklist(rows) {
    await delay(500)
    localStorage.setItem('demo-checklist', JSON.stringify(rows))
    return 'บันทึก Checklist สำเร็จ'
  },

  async getReports(liftId) {
    await delay()
    return getReports()
      .filter((r) => r.lift_id === liftId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  },

  async getReport(id) {
    await delay()
    const report = getReports().find((r) => r.id === id)
    if (!report) throw new Error('ไม่พบรายงาน')
    return report
  },

  async createReport(payload) {
    await delay(600)
    const now = new Date()
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    const report = {
      id: 'R' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(getReports().length + 1).padStart(4, '0'),
      lift_id: payload.lift_id,
      status: payload.status,
      notes: payload.notes || '',
      photo_url: (payload.photos || []).join(','),
      reported_by: (u?.name || u?.username || payload.reported_by || 'Admin'),
      reported_by_username: (u?.username || ''),
      created_at: now.toISOString(),
      checklist: payload.checklist || [],
      process_status: payload.front_scanned_at && payload.inside_scanned_at && (payload.checklist || []).length > 0 && payload.checklist.every((item) => item.result && (item.result !== 'ไม่ผ่าน' || item.note))
        ? 'ดำเนินการแล้ว'
        : 'กำลังดำเนินการ',
      front_scanned_at: payload.front_scanned_at || '',
      front_scanned_by: payload.front_scanned_by || '',
      inside_scanned_at: payload.inside_scanned_at || '',
      inside_scanned_by: payload.inside_scanned_by || '',
    }
    saveReports([...getReports(), report])
    const lift = DEMO_LIFTS.find((l) => l.id === report.lift_id)
    if (lift) {
      lift.last_status = report.status
      lift.last_reported_at = now.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    }
    return report
  },

  async updateReport(payload) {
    await delay(600)
    const reports = getReports()
    const report = reports.find((item) => item.id === payload.id)
    if (!report) throw new Error('ไม่พบรายงาน')
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    const isAdmin = ['admin', 'super_admin'].includes(u?.role)
    const isOwner = report.reported_by_username === u?.username
    if (!isAdmin && !isOwner) throw new Error('ไม่มีสิทธิ์แก้ไขรายงานนี้')
    if (!isAdmin && isOwner && report.process_status === 'ดำเนินการแล้ว') {
      throw new Error('รายงานนี้ดำเนินการแล้ว ไม่สามารถแก้ไขได้')
    }
    Object.assign(report, {
      status: payload.status || report.status,
      notes: payload.notes || '',
      photo_url: [
        ...(payload.keep_photo_urls || (report.photo_url ? report.photo_url.split(',') : [])),
        ...(payload.photos || []),
      ].join(','),
      checklist: payload.checklist || report.checklist || [],
      process_status: payload.front_scanned_at && payload.inside_scanned_at && (payload.checklist || []).length > 0 && payload.checklist.every((item) => item.result && (item.result !== 'ไม่ผ่าน' || item.note))
        ? 'ดำเนินการแล้ว'
        : 'กำลังดำเนินการ',
      front_scanned_at: payload.front_scanned_at || report.front_scanned_at || '',
      front_scanned_by: payload.front_scanned_by || report.front_scanned_by || '',
      inside_scanned_at: payload.inside_scanned_at || report.inside_scanned_at || '',
      inside_scanned_by: payload.inside_scanned_by || report.inside_scanned_by || '',
    })
    saveReports(reports)
    return report
  },
}
