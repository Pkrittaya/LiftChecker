# ระบบบันทึกลิฟท์ (Lift Report App)

เว็บแอปสำหรับตรวจสอบและบันทึกรายงานลิฟท์ เขียนด้วย **Vue 3 + Vuetify 3** และใช้ **Google Sheets** เป็นฐานข้อมูลผ่าน **Google Apps Script**

## ฟีเจอร์

- 🔐 เข้าสู่ระบบ (ตรวจสอบกับ Sheet `Users`)
- 🛗 หน้ารายการลิฟท์ + สถานะล่าสุด
- 🔍 หน้ารายละเอียดลิฟท์ + ดู QR code ของลิฟท์
- 📷 สแกน QR code เพื่อเข้าหน้ารายละเอียดลิฟท์โดยตรง (กล้องทำงานบนมือถือ)
- 📝 หน้าเพิ่มรายงานลิฟท์: ถ่ายรูปได้สูงสุด 4 รูป, หมายเหตุ, สถานะ (ปกติ / ชำรุด / กำลังซ่อม)

## โครงสร้างโปรเจค

```
web/
├── src/
│   ├── views/
│   │   ├── LoginView.vue        # หน้า login
│   │   ├── LiftListView.vue     # รายการลิฟท์
│   │   ├── LiftDetailView.vue   # รายละเอียดลิฟท์ + รายงาน
│   │   ├── LiftReportView.vue   # เพิ่มรายงานลิฟท์ (ถ่ายรูป + หมายเหตุ + สถานะ)
│   │   └── ScanView.vue         # หน้าสแกน QR
│   ├── api/client.js            # เรียก API Apps Script
│   ├── stores/auth.js           # จัดการ session login
│   └── router/index.js
└── google-apps-script/
    └── code.gs                  # Backend API (อ่าน/เขียน Google Sheets)
```

## ขั้นตอนตั้งค่า

### 1. สร้าง Google Sheet
1. ไปที่ https://sheets.new แล้วสร้าง Spreadsheet ใหม่
2. เปิด **Extensions > Apps Script** วางโค้ดจาก `google-apps-script/code.gs`
3. (ถ้า Script ไม่ได้สร้างใน Spreadsheet เดียวกัน ให้ใส่ `SPREADSHEET_ID` ใน code.gs)
4. ใน Apps Script editor ให้เลือกฟังก์ชันแล้วกด **Run** ตามลำดับ:
   - `createSheets()` — สร้าง Sheet `Lifts`, `Reports`, `Users`, `Checklist` พร้อม header และรายการตรวจตัวอย่าง 10 ข้อ
   - `addUser('admin', 'รหัสผ่าน', 'ชื่อ', 'admin')` — สร้างผู้ใช้ (ทำซ้ำเพื่อเพิ่มคนอื่น)
   - `seedSampleLifts()` — (ไม่บังคับ) เพิ่มลิฟท์ตัวอย่าง 3 ตัว

### 2. Deploy เว็บแอป Apps Script
1. กด **Deploy > New deployment**
2. เลือก type เป็น **Web app**
3. **Execute as:** Me / ตัวฉัน · **Who has access:** Anyone
4. กด Deploy แล้ว Copy **Web app URL** เช่น `https://script.google.com/macros/s/xxxx/exec`

### 3. ตั้งค่า Frontend
```bash
npm install
cp .env.example .env
# แก้ VITE_GAS_URL ใน .env ให้เป็น Web app URL ข้างต้น (ไม่ต้องมี /exec ต่อท้าย)
```
เทสต์เครื่อง:
```bash
npm run dev
```
Build ผลิต:
```bash
npm run build        # output อยู่ที่ dist/
npm run preview
```

### 4. ใช้งาน
- ล็อกอินด้วย user ที่สร้างจาก `addUser`
- QR code ของลิฟท์แต่ละตัวดูได้ที่หน้าจดรายละเอียดลิฟท์ (ค่าคือ URL ที่เปิดไปที่หน้ารายละเอียดโดยตรง เช่น `https://โดเมน/lifts/LIFT-0001`)
- พิมพ์ QR นั้นติดที่ตัวลิฟท์ แล้วแสกนผ่านหน้า "สแกน QR"

## โครงสร้าง Google Sheets

| Sheet | Columns |
|---|---|
| `Users` | `username` · `password_hash` (salted iterative SHA-256) · `name` · `role` |
| `Lifts` | `id` · `name` · `building` · `location` · `floor_count` · `qr_data` · `inside_qr_data` |
| `Reports` | `id` · `lift_id` · `process_status` (กำลังดำเนินการ/ดำเนินการแล้ว) · `notes` · `photo_url` · `reported_by` · `created_at` · `checklist_json` · ข้อมูลผู้/เวลา scan QR 2 จุด |
| `Checklist` | `type` (`section`/`item`) · `id` · `parent_id` · `title` · `text` · `sort_order` · `active` |

## สิทธิการใช้งาน (role)

| role | ความสามารถ |
|---|---|
| `user` | ดูลิฟท์/รายงาน สแกน QR เพิ่มรายงาน (สมัครเองได้ทางหน้าเว็บ) |
| `admin` | เหมือน user + หน้าจัดการผู้ใช้ (จัดการได้เฉพาะบัญชี `user` — ไม่แตะ/เลื่อนสิทธิ admin) |
| `super_admin` | ทำได้ทุกอย่างทุกหน้า/ฟังก์ชัน — จัดการได้เฉพาะบัญชี user/admin |

**ข้อกำหนดของ Super Admin:**
- แก้ไข/ลบ/เลื่อนสิทธิบัญชี super_admin ผ่าน **หน้าเว็บไม่ได้** — อนุญาตให้แก้ **ผ่าน Google Sheet อย่างเดียว** (เปลี่ยนค่าในคอลัมน์ `role`)
- สร้างได้ผ่าน **Script เท่านั้น**: แก้ค่าแล้ว Run `addSuperAdmin('username','password','name')`
- หรือเพิ่มเองใน Sheet: ใส่ `username`, เอา hash จาก `hashFor('password')`, `name`, และ `super_admin` ในคอลัมน์ `role`

> รูปที่อัพจะถูกเก็บแบบ private ใน Google Drive โฟลเดอร์ `LiftReportPhotos` แล้วเก็บ file ID ในช่อง `photo_url` โดยต้องอ่านผ่าน API ที่มีการยืนยันตัวตน

## API Endpoints (Apps Script)

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| POST | `/login` | ล็อกอิน รับ `{username, password}` → `{token, user}` |
| POST | `/register` | สมัครสมาชิก `{username, password, name, role}` (role admin ต้องล็อกอินด้วยบัญชี admin) |
| GET | `/lifts` | รายการลิฟท์ + สถานะ/เวลาล่าสุด (ต้องมี `auth_token`) |
| GET | `/lifts?id=xxx` | รายละเอียดลิฟท์ตัวเดียว |
| GET | `/reports?lift_id=xxx` | รายงานของลิฟท์ (เรียงล่าสุดก่อน) |
| GET | `/checklist` | รายการตรวจที่เปิดใช้งาน |
| GET | `/checklist-admin` | รายการ Checklist แบบแก้ไขได้ (admin/super_admin เท่านั้น) |
| POST | `/checklist-admin` | บันทึกหัวข้อ Checklist (admin/super_admin เท่านั้น) |
| POST | `/reports` | สร้างรายงาน `{lift_id, status, notes, photos[], checklist[], reported_by}` |
| PUT | `/reports` | แก้ไขรายงานที่ยัง `กำลังดำเนินการ` ด้วย `{id, checklist[], notes, ...}`; รายงาน `ดำเนินการแล้ว` แก้ไม่ได้ |

## หมายเหตุ

- Apps Script อ่าน HTTP header ไม่ได้ จึงส่ง token ผ่าน query param `auth_token`
- Frontend ส่ง body ด้วย `Content-Type: text/plain` เพื่อเลี่ยง preflight CORS ของ Apps Script
- การสแกน QR ต้องใช้ **HTTPS** (กล้องทำงานบนมือถือ/เบราว์เซอร์ที่เปิดใน https เท่านั้น)
- token อายุ 12 ชั่วโมง (ปรับได้ที่ `TOKEN_TTL_SEC` ใน code.gs)
