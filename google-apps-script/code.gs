/**
 * Google Apps Script backend สำหรับระบบบันทึกลิฟท์
 *
 * API (URL รูปแบบ: {WEBAPP_URL}?endpoint=ชื่อ)
 *   POST /login            { username, password }          -> { token, user }
 *   GET  /lifts                                           -> ลิสต์ลิฟท์ + สถานะล่าสุด
 *   GET  /lifts?&id=xxx                                  -> รายละเอียดลิฟท์ตัวเดียว
 *   GET  /reports?&lift_id=xxx                          -> รายงานทั้งหมดของลิฟท์
 *   GET  /reports?&id=xxx                               -> รายงานตัวเดียว
 *   POST /reports { lift_id, status, notes, photos[], reported_by } -> สร้างรายงาน + อัพรูป
 *   GET  /photo?id=<fileId หรือลิงก์ Drive>             -> ดึงภาพจาก Drive กลับเป็น base64
 *                                                        (เลี่ยง hotlink/rate-limit ของโหมด public)
 *
 * ทุก endpoint ยกเว้น /login ต้องส่ง Header: Authorization: Bearer <token>
 */

// ถ้า Script อยู่คนละ Spreadsheet ให้ใส่ ID ที่นี่ เช่น '1Abc...xyz'
// ถ้าใส่ค้างไว้เป็น '' จะใช้ Spreadsheet ที่ผูกกับ Script (getActiveSpreadsheet)
var SPREADSHEET_ID = '13bakysjrnJhlWejMfMn3PdLtbKzfD5e5sGMYJNgCO-Y';

var SHEET_LIFTS = 'Lifts';
var SHEET_REPORTS = 'Reports';
var SHEET_USERS = 'Users';
var SHEET_CHECKLIST = 'Checklist';

var PHOTO_FOLDER = 'LiftReportPhotos';
var TOKEN_TTL_SEC = 12 * 60 * 60; // 12 ชั่วโมง
var LEGACY_SALT = 'dao-lift-app-2026';
var PASSWORD_ITERATIONS = 20000;
var MAX_PHOTO_BYTES = 5 * 1024 * 1024;
var MAX_TOTAL_PHOTO_BYTES = 12 * 1024 * 1024;

var CURRENT_EVENT = null;
var CURRENT_BODY = null;

/* ====================== Register ====================== */

/**
 * สมัครสมาชิกจากหน้าเว็บ (endpoint /register)
 * ทุกคนที่สมัครผ่านหน้านี้จะได้สิทธิ user เสมอ
 * การเลื่อน/ลดสิทธิ admin ทำได้จากหน้า "จัดการผู้ใช้" (ดู api users)
 */
function apiRegister(body) {
  var username = String(body.username || '').trim();
  var password = String(body.password || '');
  var name = String(body.name || '').trim() || username;
  var role = 'user'; // บังคับ user เสมอ แม้ส่ง role admin มาก็ไม่สนใจ

  if (username.length < 3) {
    return respond(400, { error: true, message: 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร' });
  }
  if (password.length < 12) {
    return respond(400, { error: true, message: 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร' });
  }
  if (findUser(username)) {
    return respond(409, { error: true, message: 'ชื่อผู้ใช้ "' + username + '" ถูกใช้แล้ว' });
  }

  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return respond(500, { error: true, message: 'ไม่พบ sheet Users' });
  sheet.appendRow([username, hashPassword(password), name, role]);
  return respond(201, {
    data: { username: username, name: name, role: role },
  });
}

/* ====================== Users management (admin) ====================== */

/**
 * endpoint=users (GET)  -> รายชื่อผู้ใช้ทั้งหมด  [admin เท่านั้น]
 * endpoint=users (POST) -> จัดการสิทธิ/ลบ/แก้ไข  [admin เท่านั้น]
 *    { action: 'role', target, role }        เปลี่ยนสิทธิ (user/admin)
 *    { action: 'edit', target, username, name, role, password }  แก้ไขข้อมูล (ทุกช่อง)
 *    { action: 'delete', target }             ลบผู้ใช้
 */
function apiUsers(body, isGet) {
  var actor = requireAdmin();
  var actorRole = actor.role; // 'admin' หรือ 'super_admin'
  var isSuper = actorRole === 'super_admin';
  if (isGet) {
    return respond(200, { data: listUsers() });
  }
  var action = String(body.action || '');
  var target = String(body.target || body.username || '').trim();
  if (!target) return respond(400, { error: true, message: 'ต้องระบุผู้ใช้ (target)' });

  var targetRec = findUser(target);
  if (!targetRec) return respond(404, { error: true, message: 'ไม่พบผู้ใช้ ' + target });
  var targetRole = targetRec.role;

  // ขอบเขตสิทธิ:
  //  - super_admin: จัดการได้ทุกบัญชี ยกเว้น super_admin (ต้องแก้ใน Google Sheet เท่านั้น) และตัวเอง
  //  - admin      : จัดการได้เฉพาะบัญชีที่มีสิทธิ user เท่านั้น (แก้สิทธิ admin เองไม่ได้)
  //  - ห้ามทุกคนแก้/ลบ bัญชี super_admin ผ่าน UI (แก้ใน sheet เท่านั้น)
  function canManageTarget() {
    if (targetRole === 'super_admin') return false;
    if (isSuper) return target !== actor.username;
    return targetRole !== 'admin';
  }

  function reqRole(bodyRole) {
    var r = String(bodyRole || '').trim();
    if (r === '' || r === 'user' || r === 'admin') return r;
    return null;
  }

  if (action === 'edit') {
    var newUsername = String(body.username || target).trim();
    var newName = String(body.name || '').trim();
    var newRole = reqRole(body.role);
    var password = body.password ? String(body.password) : '';

    if (newRole === null) {
      return respond(400, { error: true, message: 'สิทธิต้องเป็น user หรือ admin (super_admin ตั้งได้จาก Google Sheet เท่านั้น)' });
    }
    if (newUsername.length < 3) {
      return respond(400, { error: true, message: 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร' });
    }
    if (password && password.length < 12) {
      return respond(400, { error: true, message: 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร' });
    }
    if (newUsername !== target && findUser(newUsername)) {
      return respond(409, { error: true, message: 'ชื่อผู้ใช้ "' + newUsername + '" ถูกใช้แล้ว' });
    }
    if (!canManageTarget()) {
      return respond(403, { error: true, message: 'บัญชีนี้ไม่สามารถจัดการผ่านหน้าเว็บได้ (แก้ใน Google Sheet แทน)' });
    }
    if (newRole === 'admin' && !isSuper) {
      return respond(403, { error: true, message: 'เฉพาะ super admin เท่านั้นที่ตั้งสิทธิ admin ได้' });
    }
    if (newRole === 'admin' || newRole === 'user') {
      if (target === actor.username) {
        return respond(400, { error: true, message: 'ไม่สามารถเปลี่ยนสิทธิของบัญชีตัวเองได้' });
      }
    }

    var sheet = getSheet(SHEET_USERS, false);
    var rowIdx = getUserRowIndex(target);
    if (newName) sheet.getRange(rowIdx, 3).setValue(newName);
    if (newUsername !== target) sheet.getRange(rowIdx, 1).setValue(newUsername);
    if (newRole === 'admin' || newRole === 'user') sheet.getRange(rowIdx, 4).setValue(newRole);
    if (password) sheet.getRange(rowIdx, 2).setValue(hashPassword(password));
    return respond(200, { data: listUsers() });
  }

  if (action === 'role') {
    var newRole = reqRole(body.role);
    if (newRole === null) {
      return respond(400, { error: true, message: 'สิทธิต้องเป็น user หรือ admin' });
    }
    if (!canManageTarget()) {
      return respond(403, { error: true, message: 'บัญชีนี้ไม่สามารถจัดการผ่านหน้าเว็บได้ (แก้ใน Google Sheet แทน)' });
    }
    if (newRole === 'admin' && !isSuper) {
      return respond(403, { error: true, message: 'เฉพาะ super admin เท่านั้นที่ตั้งสิทธิ admin ได้' });
    }
    if (target === actor.username) {
      return respond(400, { error: true, message: 'ไม่สามารถเปลี่ยนสิทธิของบัญชีตัวเองได้' });
    }
    setUserRole(target, newRole);
    return respond(200, { data: listUsers() });
  }

  if (action === 'delete') {
    if (!canManageTarget()) {
      return respond(403, { error: true, message: 'บัญชีนี้ไม่สามารถจัดการผ่านหน้าเว็บได้ (แก้ใน Google Sheet แทน)' });
    }
    deleteUser(target);
    return respond(200, { data: listUsers() });
  }

  return respond(400, { error: true, message: 'action ไม่ถูกต้อง (role/edit/delete)' });
}

function requireAdmin() {
  var user = requireAuth();
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw new UnauthorizedError('ต้องเป็นผู้ดูแลระบบเท่านั้น');
  }
  return user;
}

function listUsers() {
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var u = String(data[i][0]).trim();
    if (!u) continue;
    out.push({
      username: u,
      name: String(data[i][2] || ''),
      role: String(data[i][3] || 'user'),
    });
  }
  return out;
}

function getUserRowIndex(username) {
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return -1;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      return i + 1;
    }
  }
  return -1;
}

function setUserRole(username, role) {
  var rowIdx = getUserRowIndex(username);
  if (rowIdx === -1) return false;
  var sheet = getSheet(SHEET_USERS, true);
  sheet.getRange(rowIdx, 4).setValue(role);
  return true;
}

function deleteUser(username) {
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doPut(e) {
  return handleRequest(e, 'PUT');
}

function doGet(e) {
  return handleRequest(e, 'GET');
}

function handleRequest(e, method) {
  CURRENT_EVENT = e;
  var params = e.parameter || {};
  // ตัด "/" นำหน้า/ท้ายออกเพื่อให้รับทั้ง '/login' และ 'login'
  var endpoint = String(params.endpoint || '').replace(/^\/+|\/+$/g, '');
  var body = {};
  if (e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return respond(400, { error: true, message: 'JSON ไม่ถูกต้อง' });
    }
  }
  CURRENT_BODY = body;

  try {
    switch (endpoint) {
      case 'login':
        return apiLogin(body);
      case 'register':
        return apiRegister(body);
      case 'users':
        return apiUsers(body, method === 'GET');
      case 'checklist':
        return apiGetChecklist();
      case 'checklist-admin':
        return apiChecklistAdmin(body, method === 'GET');
      case 'lifts':
        return method === 'GET' ? apiGetLifts(params.id) : respond(405, { error: true, message: 'Method ผิด' });
      case 'reports':
        if (method === 'GET') return apiGetReports(params.lift_id, params.id);
        if (method === 'POST') return body.action === 'update' ? apiUpdateReport(body) : apiCreateReport(body);
        if (method === 'PUT') return apiUpdateReport(body);
        return respond(405, { error: true, message: 'Method ผิด' });
      case 'photo':
        return apiGetPhoto(params);
      default:
        return respond(404, { error: true, message: 'ไม่พบ endpoint: ' + endpoint });
    }
  } catch (err) {
    Logger.log(err && err.stack ? err.stack : err);
    var msg = (err && err.message) || String(err);
    var code = (err instanceof UnauthorizedError) ? 401 : 500;
    return respond(code, { error: true, message: msg });
  }
}

/* ====================== Auth ====================== */

function apiLogin(body) {
  var username = String(body.username || '').trim();
  var password = String(body.password || '');
  if (!username || !password) {
    return respond(400, { error: true, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  var row = findUser(username);
  if (!row) {
    return respond(401, { error: true, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (!verifyPassword(password, row.password_hash)) {
    return respond(401, { error: true, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  var token = Utilities.getUuid().replace(/-/g, '');
  var cache = CacheService.getScriptCache();
  cache.put(token, JSON.stringify({ username: row.username, name: row.name, role: row.role }), TOKEN_TTL_SEC);
  return respond(200, {
    data: {
      token: token,
      user: { username: row.username, name: row.name, role: row.role },
    },
  });
}

function UnauthorizedError(msg) {
  this.message = msg;
}

function requireAuth() {
  // Apps Script อ่าน header ไม่ได้ จึงรับ token ผ่าน query param auth_token
  // (frontend จะแนบ auth_token ไปกับ URL ทุก request)
  var all = Object.assign({}, (CURRENT_EVENT && CURRENT_EVENT.parameter) || {});
  var token = (CURRENT_BODY && (CURRENT_BODY.auth_token || CURRENT_BODY.token)) || all.auth_token || all.token || null;
  if (!token) {
    throw new UnauthorizedError('ยังไม่ได้ล็อกอิน (ไม่พบ token)');
  }
  var cache = CacheService.getScriptCache();
  var val = cache.get(token);
  if (!val) {
    throw new UnauthorizedError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }
  return JSON.parse(val);
}

/** function ให้เรียกจาก Apps Script editor เพื่อสร้างผู้ใช้
 * วิธีใช้: กด Run แล้วกรอกค่าใน dialog แบบนี้
 *   ชื่อผู้ใช้: admin   รหัสผ่าน: อย่างน้อย 12 ตัวอักษร   ชื่อ: Admin   บทบาท: admin
 * หรือใช้แบบระบุค่าตรง: addUser('admin', 'รหัสผ่านใหม่', 'Admin', 'admin')
 */
function addUser(username, password, name, role) {
  // รับค่าผ่าน dialog ถ้าอย่างน้อย username ว่าง (ไม่มี args ถูกส่ง)
  if (arguments.length === 0 || !username) {
    if (!Browser) throw new Error('กรอกรายละเอียดในโค้ด: addUser("username","password","name","role")');
    username = Browser.inputBox('สร้างผู้ใช้', 'กรอกชื่อผู้ใช้ (username):', Browser.Buttons.OK_CANCEL);
    if (username === '' || username === 'cancel') throw new Error('ยกเลิกการสร้างผู้ใช้');
    password = Browser.inputBox('สร้างผู้ใช้', 'กรอกรหัสผ่าน:', Browser.Buttons.OK_CANCEL);
    name = Browser.inputBox('สร้างผู้ใช้', 'กรอกชื่อจริง:', Browser.Buttons.OK_CANCEL);
    role = Browser.inputBox('สร้างผู้ใช้', 'กรอกบทบาท (user/admin):', Browser.Buttons.OK_CANCEL) || 'user';
  }
  username = String(username).trim();
  if (!username) throw new Error('ชื่อผู้ใช้ห้ามว่าง');
  if (!password || String(password).length < 12) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร');
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_USERS);
  if (findUser(username)) throw new Error('ชื่อผู้ใช้ซ้ำ: ' + username);
  name = name || username;
  role = role || 'user';
  sheet.appendRow([username, hashPassword(password), name, role]);
  return 'เพิ่มผู้ใช้ ' + username + ' สำเร็จ';
}

/** function ให้เรียกจาก Apps Script editor เพื่อแก้รหัสผ่าน: setPassword('admin','newpass') */
function setPassword(username, password) {
  if (String(password || '').length < 12) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร');
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_USERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username).trim()) {
      sheet.getRange(i + 1, 2).setValue(hashPassword(password));
      return 'เปลี่ยนรหัสผ่าน ' + username + ' สำเร็จ';
    }
  }
  throw new Error('ไม่พบผู้ใช้: ' + username);
}

function bytesToHex(digest) {
  return digest.map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function hashPassword(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  var value = salt + String(password);
  for (var i = 0; i < PASSWORD_ITERATIONS; i++) {
    value = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
  }
  return 'v2$' + salt + '$' + value;
}

function verifyPassword(password, stored) {
  stored = String(stored || '');
  if (stored.indexOf('v2$') === 0) {
    var parts = stored.split('$');
    if (parts.length !== 3) return false;
    var value = parts[1] + String(password);
    for (var i = 0; i < PASSWORD_ITERATIONS; i++) {
      value = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
    }
    return value === parts[2];
  }
  // Keep existing accounts usable; reset them to v2 when their password is changed.
  return legacyHashPassword(password) === stored;
}

function legacyHashPassword(password) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, LEGACY_SALT + password));
}

function findUser(username) {
  var sheet = getSheet(SHEET_USERS, false);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      return { username: String(data[i][0]), password_hash: String(data[i][1] || ''), name: String(data[i][2] || ''), role: String(data[i][3] || 'user') };
    }
  }
  return null;
}

/* ====================== Lifts ====================== */

function apiGetLifts(id) {
  requireAuth();
  if (id) return apiGetLift(id);
  var lifts = getLifts();
  return respond(200, { data: lifts });
}

function apiGetLift(id) {
  var lift = getLift(id);
  if (!lift) {
    return respond(404, { error: true, message: 'ไม่พบลิฟท์รหัส ' + id });
  }
  return respond(200, { data: lift });
}

function getLifts() {
  var sheet = getSheet(SHEET_LIFTS, false);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_LIFTS + ' (ตรวจสอบชื่อ sheet)');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(normalizeHeader);
  var lifts = [];
  var idx = {};
  for (var j = 0; j < headers.length; j++) idx[headers[j]] = j;

  var latestByLift = getLatestReportStatus();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[idx.id]) continue;
     var lift = {
      id: String(row[idx.id] || ''),
      name: String(row[idx.name] || ''),
      building: String(row[idx.building] || ''),
      location: String(row[idx.location] || ''),
      floor_count: row[idx.floor_count] !== undefined && row[idx.floor_count] !== '' ? Number(row[idx.floor_count]) : null,
       qr_data: row[idx.qr_data] !== undefined ? String(row[idx.qr_data] || '') : '',
       inside_qr_data: row[idx.inside_qr_data] !== undefined ? String(row[idx.inside_qr_data] || '') : '',
    };
    var last = latestByLift[lift.id];
    if (last) {
      lift.last_status = last.status;
      lift.last_reported_at = formatDate(last.created_at);
    }
    lifts.push(lift);
  }
  return lifts;
}

function getLift(id) {
  var lifts = getLifts();
  for (var i = 0; i < lifts.length; i++) {
    if (lifts[i].id === String(id)) return lifts[i];
  }
  return null;
}

function getLatestReportStatus() {
  var sheet = getSheet(SHEET_REPORTS, true);
  var out = {};
  if (!sheet) return out;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  var headers = data[0].map(normalizeHeader);
  var idx = {};
  for (var j = 0; j < headers.length; j++) idx[headers[j]] = j;
  // วนจากล่างขึ้นบน (แถวล่าสุดก่อน) เพื่อเอา report ล่าสุด
  for (var i = data.length - 1; i >= 1; i--) {
    var liftId = String(data[i][idx.lift_id] || '');
    if (!liftId) continue;
    if (out[liftId]) continue;
     out[liftId] = {
       status: String((idx.process_status !== undefined && data[i][idx.process_status]) || data[i][idx.status] || ''),
      created_at: new Date(data[i][idx.created_at]),
    };
  }
  return out;
}

/* ====================== Reports ====================== */

function apiGetReports(liftId, reportId) {
  requireAuth();
  if (reportId) {
    var one = getReport(reportId);
    if (!one) return respond(404, { error: true, message: 'ไม่พบรายงาน' });
    return respond(200, { data: one });
  }
  if (liftId) {
    return respond(200, { data: getReportsByLift(liftId) });
  }
  return respond(400, { error: true, message: 'ต้องระบุ lift_id หรือ id' });
}

function apiCreateReport(body) {
  var authUser = requireAuth();
  var liftId = String(body.lift_id || '').trim();
  var status = String(body.status || 'ปกติ').trim();
  if (!liftId) return respond(400, { error: true, message: 'ขาด lift_id' });
  if (!getLift(liftId)) return respond(404, { error: true, message: 'ไม่พบลิฟท์รหัส ' + liftId });
  var statusMap = { 'ปกติ': 1, 'ชำรุด': 1, 'กำลังซ่อม': 1 };
  if (!statusMap[status]) return respond(400, { error: true, message: 'สถานะไม่ถูกต้อง (ปกติ/ชำรุด/กำลังซ่อม)' });

  var notes = String(body.notes || '').slice(0, 1000);
  var checklist = Array.isArray(body.checklist) ? body.checklist.slice(0, 30).map(function (item) {
    return {
      id: String(item.id || '').slice(0, 100),
      title: String(item.title || '').slice(0, 200),
      text: String(item.text || '').slice(0, 500),
      result: String(item.result || '').slice(0, 30),
      note: String(item.note || '').slice(0, 500),
    };
  }).filter(function (item) { return item.id; }) : [];
  var totalChecklistItems = checklist.length;
  var checklistWithResults = checklist.filter(function (item) { return item.result; });
  var photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  var totalPhotoBytes = 0;

  var photoUrls = [];
  for (var i = 0; i < photos.length; i++) {
    if (typeof photos[i] !== 'string') return respond(400, { error: true, message: 'รูปภาพไม่ถูกต้อง' });
    var encodedLength = photos[i].length;
    var estimatedBytes = Math.floor(encodedLength * 3 / 4);
    if (estimatedBytes > MAX_PHOTO_BYTES || (totalPhotoBytes + estimatedBytes) > MAX_TOTAL_PHOTO_BYTES) {
      return respond(413, { error: true, message: 'รูปภาพมีขนาดใหญ่เกินกำหนด' });
    }
    totalPhotoBytes += estimatedBytes;
    photoUrls.push(uploadPhoto(photos[i]));
  }
  var checklistComplete = totalChecklistItems > 0 && checklistWithResults.length === totalChecklistItems && checklistWithResults.every(function (item) {
    return item.result && (item.result !== 'ไม่ผ่าน' || item.note);
  });

  var now = new Date();
  var report = {
    id: 'R' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-' + Utilities.getUuid().slice(0, 8).replace(/-/g, ''),
    lift_id: liftId,
    status: status,
    notes: notes,
    photo_url: photoUrls.join(','),
    reported_by: authUser.name || authUser.username || '',
    reported_by_username: authUser.username || '',
    created_at: now.toISOString(),
    checklist: checklist,
    process_status: body.front_scanned_at && body.inside_scanned_at && checklistComplete ? 'ดำเนินการแล้ว' : 'กำลังดำเนินการ',
    front_scanned_at: String(body.front_scanned_at || ''),
    front_scanned_by: String(body.front_scanned_by || ''),
    inside_scanned_at: String(body.inside_scanned_at || ''),
    inside_scanned_by: String(body.inside_scanned_by || ''),
  };

  var sheet = getSheet(SHEET_REPORTS, true);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_REPORTS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader);
  ['checklist_json', 'process_status', 'front_scanned_at', 'front_scanned_by', 'inside_scanned_at', 'inside_scanned_by', 'reported_by_username'].forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
  var row = headers.map(function (header) {
    if (header === 'id') return report.id;
    if (header === 'lift_id') return report.lift_id;
    if (header === 'status') return report.status;
    if (header === 'notes') return report.notes;
    if (header === 'photo_url') return report.photo_url;
    if (header === 'reported_by') return report.reported_by;
    if (header === 'created_at') return now;
    if (header === 'checklist_json') return JSON.stringify(checklist);
    if (header === 'process_status') return report.process_status;
    if (header === 'front_scanned_at') return report.front_scanned_at;
    if (header === 'front_scanned_by') return report.front_scanned_by;
    if (header === 'inside_scanned_at') return report.inside_scanned_at;
    if (header === 'inside_scanned_by') return report.inside_scanned_by;
    if (header === 'reported_by_username') return report.reported_by_username;
    return '';
  });
  sheet.appendRow(row);

  return respond(201, { data: report });
}

function apiUpdateReport(body) {
  var authUser = requireAuth();
  var reportId = String(body.id || '').trim();
  if (!reportId) return respond(400, { error: true, message: 'ขาด id รายงาน' });
  var sheet = getSheet(SHEET_REPORTS, false);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(normalizeHeader);
  var idx = {};
  headers.forEach(function (header, i) { idx[header] = i; });
  var rowNumber = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx.id] || '') === reportId) { rowNumber = i + 1; break; }
  }
  if (rowNumber === -1) return respond(404, { error: true, message: 'ไม่พบรายงาน' });
  var isSuperAdmin = authUser.role === 'super_admin';
  var isAdmin = authUser.role === 'admin' || isSuperAdmin;
  var reportUsername = idx.reported_by_username !== undefined ? String(data[rowNumber - 1][idx.reported_by_username] || '') : '';
  var isOwner = reportUsername === authUser.username;
  var isCompleted = String(data[rowNumber - 1][idx.process_status] || '') === 'ดำเนินการแล้ว';
  if (!isAdmin && !isOwner) {
    return respond(403, { error: true, message: 'ไม่มีสิทธิ์แก้ไขรายงานนี้' });
  }
  if (!isAdmin && isOwner && isCompleted) {
    return respond(403, { error: true, message: 'รายงานนี้ดำเนินการแล้ว ไม่สามารถแก้ไขได้' });
  }

  var checklist = Array.isArray(body.checklist) ? body.checklist.slice(0, 30).map(function (item) {
    return {
      id: String(item.id || '').slice(0, 100),
      title: String(item.title || '').slice(0, 200),
      text: String(item.text || '').slice(0, 500),
      result: String(item.result || '').slice(0, 30),
      note: String(item.note || '').slice(0, 500),
    };
  }).filter(function (item) { return item.id; }) : [];
  var frontAt = String(body.front_scanned_at || data[rowNumber - 1][idx.front_scanned_at] || '');
  var frontBy = String(body.front_scanned_by || data[rowNumber - 1][idx.front_scanned_by] || '');
  var insideAt = String(body.inside_scanned_at || data[rowNumber - 1][idx.inside_scanned_at] || '');
  var insideBy = String(body.inside_scanned_by || data[rowNumber - 1][idx.inside_scanned_by] || '');
  var existingPhoto = idx.photo_url !== undefined ? String(data[rowNumber - 1][idx.photo_url] || '') : '';
  var keptPhotoUrls = Object.prototype.hasOwnProperty.call(body, 'keep_photo_urls') && Array.isArray(body.keep_photo_urls)
    ? body.keep_photo_urls.slice(0, 4).map(function (photo) { return String(photo || '').trim(); }).filter(Boolean)
    : existingPhoto.split(/[,,\s]+/).filter(Boolean);
  var newPhotoUrls = [];
  if (Array.isArray(body.photos)) {
    body.photos.slice(0, Math.max(0, 4 - keptPhotoUrls.length)).forEach(function (photo) {
      if (typeof photo === 'string' && photo) newPhotoUrls.push(uploadPhoto(photo));
    });
  }
  var photoUrl = keptPhotoUrls.concat(newPhotoUrls).join(',');
  var totalChecklistItems = checklist.length;
  var checklistWithResults = checklist.filter(function (item) { return item.result; });
  var checklistComplete = totalChecklistItems > 0 && checklistWithResults.length === totalChecklistItems && checklistWithResults.every(function (item) {
    return item.result && (item.result !== 'ไม่ผ่าน' || item.note);
  });
  var updates = {
    status: String(body.status || data[rowNumber - 1][idx.status] || 'ปกติ'),
    notes: String(body.notes || '').slice(0, 1000),
    photo_url: photoUrl,
    photo_url: photoUrl,
    checklist_json: JSON.stringify(checklist),
    process_status: frontAt && insideAt && checklistComplete ? 'ดำเนินการแล้ว' : 'กำลังดำเนินการ',
    front_scanned_at: frontAt,
    front_scanned_by: frontBy,
    inside_scanned_at: insideAt,
    inside_scanned_by: insideBy,
  };
  Object.keys(updates).forEach(function (header) {
    if (idx[header] !== undefined) sheet.getRange(rowNumber, idx[header] + 1).setValue(updates[header]);
  });
  return respond(200, { data: getReport(reportId) });
}

function getReportsByLift(liftId) {
  var sheet = getSheet(SHEET_REPORTS, false);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_REPORTS);
  var data = sheet.getDataRange().getValues();
  var out = [];
  if (data.length < 2) return out;
  var headers = data[0].map(normalizeHeader);
  var idx = {};
  for (var j = 0; j < headers.length; j++) idx[headers[j]] = j;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx.lift_id] || '') === String(liftId)) {
      out.push(rowToReport(data[i], idx));
    }
  }
  out.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  return out;
}

function getReport(id) {
  var sheet = getSheet(SHEET_REPORTS, false);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0].map(normalizeHeader);
  var idx = {};
  for (var j = 0; j < headers.length; j++) idx[headers[j]] = j;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx.id] || '') === String(id)) return rowToReport(data[i], idx);
  }
  return null;
}

function rowToReport(row, idx) {
  var ts = row[idx.created_at];
  if (ts instanceof Date && isNaN(ts.getTime())) ts = null;
  if (typeof ts === 'string') ts = new Date(ts);
  var checklist = [];
  if (idx.checklist_json !== undefined && row[idx.checklist_json]) {
    try { checklist = JSON.parse(String(row[idx.checklist_json])); } catch (err) { checklist = []; }
  }
  return {
    id: String(row[idx.id] || ''),
    lift_id: String(row[idx.lift_id] || ''),
    status: String(row[idx.status] || ''),
    notes: String(row[idx.notes] || ''),
    photo_url: String(row[idx.photo_url] || ''),
    reported_by: String(row[idx.reported_by] || ''),
    reported_by_username: idx.reported_by_username !== undefined ? String(row[idx.reported_by_username] || '') : '',
    created_at: ts ? ts.toISOString() : null,
    checklist: checklist,
    process_status: String(row[idx.process_status] || ''),
    front_scanned_at: String(row[idx.front_scanned_at] || ''),
    front_scanned_by: String(row[idx.front_scanned_by] || ''),
    inside_scanned_at: String(row[idx.inside_scanned_at] || ''),
    inside_scanned_by: String(row[idx.inside_scanned_by] || ''),
  };
}

function apiGetChecklist() {
  requireAuth();
  var sheet = getSheet(SHEET_CHECKLIST, true);
  if (!sheet || sheet.getLastRow() < 2) return respond(200, { data: [] });
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(normalizeHeader);
  var idx = {};
  headers.forEach(function (header, i) { idx[header] = i; });
  var sections = {};
  for (var s = 1; s < data.length; s++) {
    var sectionRow = data[s];
    if (String(sectionRow[idx.type] || 'item').toLowerCase() !== 'section') continue;
    var sectionId = String(sectionRow[idx.id] || '').trim();
    if (sectionId) sections[sectionId] = String(sectionRow[idx.title] || '').trim();
  }
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = String(row[idx.id] || '').trim();
    var title = String(row[idx.title] || '').trim();
    if (!id || !title) continue;
    if (String(row[idx.type] || 'item').toLowerCase() === 'section') continue;
    var active = idx.active === undefined || ['', 'true', '1', 'yes', 'ใช่'].indexOf(String(row[idx.active]).trim().toLowerCase()) !== -1;
    if (!active) continue;
    out.push({
      id: id,
      title: title,
      text: String(row[idx.text] || '').trim(),
      group_id: String(row[idx.parent_id] || '').trim(),
      group_title: sections[String(row[idx.parent_id] || '').trim()] || 'รายการตรวจลิฟท์',
      sort_order: Number(row[idx.sort_order] || i),
    });
  }
  out.sort(function (a, b) { return a.sort_order - b.sort_order; });
  return respond(200, { data: out });
}

function apiChecklistAdmin(body, isGet) {
  requireAdmin();
  var sheet = getSheet(SHEET_CHECKLIST, true);
  if (isGet) {
    if (!sheet || sheet.getLastRow() < 2) return respond(200, { data: [] });
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(normalizeHeader);
    var idx = {};
    headers.forEach(function (header, i) { idx[header] = i; });
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      rows.push({
        type: String(data[i][idx.type] || 'item'),
        id: String(data[i][idx.id] || ''),
        parent_id: String(data[i][idx.parent_id] || ''),
        title: String(data[i][idx.title] || ''),
        text: String(data[i][idx.text] || ''),
        sort_order: Number(data[i][idx.sort_order] || i),
        active: idx.active === undefined || String(data[i][idx.active]).toLowerCase() !== 'false',
      });
    }
    return respond(200, { data: rows });
  }

  var rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
  if (!rows.length) return respond(400, { error: true, message: 'ต้องมีหัวข้อ Checklist อย่างน้อย 1 รายการ' });
  var output = [['type', 'id', 'parent_id', 'title', 'text', 'sort_order', 'active']];
  rows.forEach(function (item, i) {
    var type = String(item.type || 'item') === 'section' ? 'section' : 'item';
    var id = String(item.id || '').trim().slice(0, 100);
    var title = String(item.title || '').trim().slice(0, 200);
    if (!id || !title) return;
    output.push([
      type,
      id,
      type === 'section' ? '' : String(item.parent_id || '').trim().slice(0, 100),
      title,
      String(item.text || '').trim().slice(0, 500),
      Number(item.sort_order || i),
      item.active !== false,
    ]);
  });
  if (output.length === 1) return respond(400, { error: true, message: 'หัวข้อ Checklist ไม่ถูกต้อง' });
  if (!sheet) sheet = getSpreadsheet().insertSheet(SHEET_CHECKLIST);
  sheet.clearContents();
  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  return respond(200, { data: 'บันทึก Checklist สำเร็จ' });
}

/* ====================== Photo upload ====================== */

/**
 * endpoint=photo (GET) -> ดึงภาพจาก Google Drive ผ่าน Server (Script) แล้วคืนเป็น base64
 * ป้องกันปัญหาภาพ hotlink / rate-limit 429 ที่เกิดกับไฟล์ Drive แบบสาธารณะ
 * ใช้: {WEBAPP_URL}?endpoint=photo&id=<fileId>
 *   id = รับได้ทั้ง file id หรือลิงก์ Drive เต็มรูปแบบ (uc?export=view&id=...)
 */
function apiGetPhoto(params) {
  requireAuth();
  var raw = String(params.id || '').trim();
  if (!raw) return respond(400, { error: true, message: 'ต้องระบุ id รูป (photo?id=...)' });
  var m = raw.match(/[a-zA-Z0-9\-\_]{20,}/);
  var fileId = m ? m[0] : '';
  if (!fileId) return respond(400, { error: true, message: 'รูปแบบ id รูปไม่ถูกต้อง: ' + raw });
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var parents = DriveApp.getFileById(fileId).getParents();
    var inPhotoFolder = false;
    while (parents.hasNext()) {
      if (parents.next().getName() === PHOTO_FOLDER) {
        inPhotoFolder = true;
        break;
      }
    }
    if (!inPhotoFolder) return respond(403, { error: true, message: 'ไม่อนุญาตให้อ่านไฟล์นี้' });
    if (String(blob.getContentType()).indexOf('image/') !== 0) {
      return respond(415, { error: true, message: 'ไฟล์นี้ไม่ใช่รูปภาพ' });
    }
    var bytes = blob.getBytes();
    var MAX = 10 * 1024 * 1024; // จำกัดขนาดก่อนตอบ (ContentService response limit)
    if (bytes.length > MAX) {
      return respond(413, {
        error: true,
        message: 'รูปใหญ่เกินไป (' + Math.round(bytes.length / 1024 / 1024) + ' MB) กรุณาใช้อีกรูปที่เล็กกว่า',
      });
    }
    return respond(200, {
      data: {
        file_id: fileId,
        content_type: blob.getContentType(),
        base64: Utilities.base64Encode(bytes),
        size: bytes.length,
      },
    });
  } catch (err) {
    return respond(404, { error: true, message: 'เปิดรูปจาก Drive ไม่สำเร็จ: ' + String(err.message || err) });
  }
}

function uploadPhoto(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\//.test(dataUrl)) {
    throw new Error('รูปภาพไม่ถูกต้อง');
  }
  var match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) throw new Error('รูปภาพ format ไม่ถูกต้อง');
  var mime = match[1];
  var base64 = match[2];
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(mime) === -1) {
    throw new Error('รองรับเฉพาะ JPEG, PNG, GIF และ WebP');
  }
  var ext = mime.split('/')[1].replace('jpeg', 'jpg');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป');
  var blob = Utilities.newBlob(bytes, mime, 'report-' + Utilities.getUuid() + '.' + ext);

  var folder = getOrCreateFolder(PHOTO_FOLDER);
  var file = folder.createFile(blob);
  // เก็บเป็น private; frontend ขอรูปผ่าน apiGetPhoto หลังตรวจ token และโฟลเดอร์แล้ว
  return file.getId();
}

function getOrCreateFolder(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

/* ====================== Helpers ====================== */

function getSheet(name, optional) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet && !optional) {
    throw new Error('ไม่พบ sheet "' + name + '" ใน Spreadsheet');
  }
  return sheet;
}

function getSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function normalizeHeader(h) {
  var s = String(h || '').trim().toLowerCase();
  s = s.replace(/\s+/g, '_');
  s = s.replace(/-/g, '_');
  return s;
}

function formatDate(d) {
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function respond(code, obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script จะส่ง header Access-Control-Allow-Origin ให้อัตโนมัติ
  // (ไม่ใช้ setHeaders เพราะ TextOutput บางรันไทม์ไม่มี method นี้)
  return out;
}

/* ====================== Setup ====================== */

/**
 * function ให้เรียกจาก Apps Script editor ครั้งแรก
 * เพื่อสร้าง Sheet: Users, Lifts, Reports พร้อม header ให้อัตโนมัติ
 * ตัวอย่างการใช้งาน:
 *   createSheets()
 *   addUser('admin', 'รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร', 'Admin', 'admin')
 *   seedSampleLifts()
 */
function createSheets() {
  var ss = getSpreadsheet();
  var created = [];
  var defs = {
    Lifts: [['id', 'name', 'building', 'location', 'floor_count', 'qr_data', 'inside_qr_data']],
    Reports: [['id', 'lift_id', 'status', 'notes', 'photo_url', 'reported_by', 'created_at', 'checklist_json', 'process_status', 'front_scanned_at', 'front_scanned_by', 'inside_scanned_at', 'inside_scanned_by']],
    Users: [['username', 'password_hash', 'name', 'role']],
    Checklist: [
      ['type', 'id', 'parent_id', 'title', 'text', 'sort_order', 'active'],
      ['section', 'operation-safety', '', 'การทำงานและความปลอดภัย', 'ตรวจสอบการทำงานหลักและระบบความปลอดภัยของลิฟท์', 1, true],
      ['item', 'door', 'operation-safety', 'ประตูลิฟท์', 'ประตูเปิดและปิดสนิท ไม่ติดขัด และไม่มีเสียงผิดปกติ', 2, true],
      ['item', 'floor-level', 'operation-safety', 'การจอดตรงชั้น', 'ลิฟท์จอดเสมอระดับพื้น ไม่สูงหรือต่ำกว่าพื้นชั้นมากเกินไป', 3, true],
      ['item', 'button', 'operation-safety', 'ปุ่มกดและไฟแสดงผล', 'ปุ่มกดทุกชั้น ปุ่มเปิดประตู และไฟแสดงผลทำงานครบถ้วน', 4, true],
      ['item', 'ride', 'operation-safety', 'การเคลื่อนที่', 'ลิฟท์เคลื่อนที่นุ่มนวล ไม่มีอาการกระตุก สั่น หรือหยุดผิดปกติ', 5, true],
      ['item', 'safety', 'operation-safety', 'ระบบความปลอดภัย', 'เซนเซอร์ประตูและระบบหยุดฉุกเฉินทำงาน ไม่มีสิ่งกีดขวางบริเวณประตู', 6, true],
      ['section', 'condition-equipment', '', 'สภาพแวดล้อมและอุปกรณ์', 'ตรวจสอบสภาพภายใน อุปกรณ์แสดงผล และอุปกรณ์ฉุกเฉิน', 7, true],
      ['item', 'display', 'condition-equipment', 'จอแสดงชั้นและทิศทาง', 'จอแสดงชั้น ลูกศรขึ้นลง และเสียงแจ้งชั้นทำงานถูกต้อง', 8, true],
      ['item', 'lighting', 'condition-equipment', 'ไฟส่องสว่างและพัดลม', 'ไฟภายในห้องโดยสารและพัดลมระบายอากาศทำงานปกติ', 9, true],
      ['item', 'alarm', 'condition-equipment', 'สัญญาณฉุกเฉิน', 'ปุ่มกริ่งฉุกเฉิน โทรศัพท์ หรือระบบสื่อสารฉุกเฉินพร้อมใช้งาน', 10, true],
      ['item', 'cleanliness', 'condition-equipment', 'ความสะอาดและสภาพภายใน', 'พื้น ผนัง กระจก ราวจับ และแผงควบคุมสะอาด ไม่มีความเสียหายชัดเจน', 11, true],
      ['item', 'signage', 'condition-equipment', 'ป้ายและอุปกรณ์ประจำลิฟท์', 'ป้ายบอกน้ำหนัก จำนวนผู้โดยสาร และอุปกรณ์ฉุกเฉินอยู่ครบถ้วน', 12, true],
    ],
  };
  Object.keys(defs).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }
    var rows = defs[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    }
    if (name === SHEET_LIFTS) {
      var liftHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader);
      if (liftHeaders.indexOf('inside_qr_data') === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue('inside_qr_data');
      }
    }
  });
  return 'Sheet พร้อมใช้งาน: ' + (created.join(', ') || 'มีอยู่แล้วทั้งหมด');
}

/** ล้างและสร้างข้อมูลตัวอย่าง Checklist ใหม่ 2 หัวข้อใหญ่ หัวข้อละ 5 ข้อ */
function resetChecklist() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CHECKLIST) || ss.insertSheet(SHEET_CHECKLIST);
  var rows = [
    ['type', 'id', 'parent_id', 'title', 'text', 'sort_order', 'active'],
    ['section', 'operation-safety', '', 'การทำงานและความปลอดภัย', 'ตรวจสอบการทำงานหลักและระบบความปลอดภัยของลิฟท์', 1, true],
    ['item', 'door', 'operation-safety', 'ประตูลิฟท์', 'ประตูเปิดและปิดสนิท ไม่ติดขัด และไม่มีเสียงผิดปกติ', 2, true],
    ['item', 'floor-level', 'operation-safety', 'การจอดตรงชั้น', 'ลิฟท์จอดเสมอระดับพื้น ไม่สูงหรือต่ำกว่าพื้นชั้นมากเกินไป', 3, true],
    ['item', 'button', 'operation-safety', 'ปุ่มกดและไฟแสดงผล', 'ปุ่มกดทุกชั้น ปุ่มเปิดประตู และไฟแสดงผลทำงานครบถ้วน', 4, true],
    ['item', 'ride', 'operation-safety', 'การเคลื่อนที่', 'ลิฟท์เคลื่อนที่นุ่มนวล ไม่มีอาการกระตุก สั่น หรือหยุดผิดปกติ', 5, true],
    ['item', 'safety', 'operation-safety', 'ระบบความปลอดภัย', 'เซนเซอร์ประตูและระบบหยุดฉุกเฉินทำงาน ไม่มีสิ่งกีดขวางบริเวณประตู', 6, true],
    ['section', 'condition-equipment', '', 'สภาพแวดล้อมและอุปกรณ์', 'ตรวจสอบสภาพภายใน อุปกรณ์แสดงผล และอุปกรณ์ฉุกเฉิน', 7, true],
    ['item', 'display', 'condition-equipment', 'จอแสดงชั้นและทิศทาง', 'จอแสดงชั้น ลูกศรขึ้นลง และเสียงแจ้งชั้นทำงานถูกต้อง', 8, true],
    ['item', 'lighting', 'condition-equipment', 'ไฟส่องสว่างและพัดลม', 'ไฟภายในห้องโดยสารและพัดลมระบายอากาศทำงานปกติ', 9, true],
    ['item', 'alarm', 'condition-equipment', 'สัญญาณฉุกเฉิน', 'ปุ่มกริ่งฉุกเฉิน โทรศัพท์ หรือระบบสื่อสารฉุกเฉินพร้อมใช้งาน', 10, true],
    ['item', 'cleanliness', 'condition-equipment', 'ความสะอาดและสภาพภายใน', 'พื้น ผนัง กระจก ราวจับ และแผงควบคุมสะอาด ไม่มีความเสียหายชัดเจน', 11, true],
    ['item', 'signage', 'condition-equipment', 'ป้ายและอุปกรณ์ประจำลิฟท์', 'ป้ายบอกน้ำหนัก จำนวนผู้โดยสาร และอุปกรณ์ฉุกเฉินอยู่ครบถ้วน', 12, true],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return 'สร้าง Checklist ตัวอย่าง 2 หัวข้อใหญ่ 10 ข้อย่อยเรียบร้อย';
}

/** กด Run ครั้งเดียว: สร้าง sheets + ลิฟท์ตัวอย่าง 3 ตัว (สร้างผู้ใช้แยกด้วย addUser) */
function setupAll() {
  createSheets();
  var admin = 'สร้าง sheet แล้ว กรุณาเรียก addUser(username, password, name, role) ด้วยรหัสผ่านอย่างน้อย 12 ตัวอักษร';
  var lifts;
  try {
    lifts = seedSampleLifts();
  } catch (e) {
    lifts = 'ลิฟท์ตัวอย่างมีอยู่แล้ว';
  }
  return 'เสร็จสิ้น: ' + admin + ' | ' + lifts;
}

/** กด Run ถ้าต้องการสร้างผู้ใช้ admin เท่านั้น (ไม่สร้างข้อมูลอื่น) */
function setupAdmin() {
  createSheets();
  return 'กรุณาเรียก addUser("admin", "รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร", "Admin", "admin")';
}

/** กด Run เพื่อสร้าง Super Admin (สร้างผ่าน Script/Sheet เท่านั้น ไม่มีในหน้าเว็บ)
 *  เช่น addSuperAdmin('sadmin', 'รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร', 'Super Admin')
 *  หรือกด Run แล้วแก้ค่าข้างในวงเล็บก่อนรัน
 */
function addSuperAdmin(username, password, name) {
  username = String(username || '').trim();
  if (!username || String(password || '').length < 12) return 'ต้องระบุ username และรหัสผ่านอย่างน้อย 12 ตัวอักษร';
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return 'ไม่พบชีต Users';
  if (findUser(username)) return 'ชื่อผู้ใช้ซ้ำ: ' + username;
  sheet.appendRow([username, hashPassword(String(password)), String(name || username), 'super_admin']);
  return 'เพิ่ม Super Admin "' + username + '" สำเร็จ (แก้ไขผ่าน Google Sheet เท่านั้น)';
}

/** กด Run เพื่อลบ row ขยะ (username = undefined / ว่าง) ในชีต Users */
function cleanupBadUsers() {
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return 'ไม่พบชีต Users';
  var data = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var u = String(data[i][0] || '').trim().toLowerCase();
    if (u === '' || u === 'undefined' || u === 'null') {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return 'ลบ row ขยะออก ' + removed + ' แถว';
}

/** function ให้กด Run เพื่อดู hash ของรหัสผ่าน เพื่อเอาไปวางในชีต Users เอง
 *  ใช้รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร แล้วเอา hash ที่ได้วางในคอลัมน์ password_hash
 */
function hashFor(password) {
  var p = String(password || '');
  if (!p || p.length < 12) return 'ใส่รหัสผ่านอย่างน้อย 12 ตัวอักษร: hashFor("รหัสผ่านใหม่")';
  return hashPassword(p);
}

/** function ให้แก้รหัสผ่านผู้ใช้โดยตรงในชีตได้ง่ายๆ
 *  ใช้: setPasswordDirect('kitto', 'รหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร') หรือกด Run แล้วกรอก dialog
 */
function setPasswordDirect(username, password) {
  var sheet = getSheet(SHEET_USERS, true);
  if (!sheet) return 'ไม่พบชีต Users';
  if (arguments.length === 0 || !username || !password) {
    if (typeof Browser !== 'undefined') {
      username = Browser.inputBox('แก้รหัสผ่าน', 'ชื่อผู้ใช้:', Browser.Buttons.OK_CANCEL);
      password = Browser.inputBox('แก้รหัสผ่าน', 'รหัสผ่านใหม่:', Browser.Buttons.OK_CANCEL);
    }
  }
  if (!username || !password) return 'กรอกข้อมูลไม่ครบ';
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).trim().toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(hashPassword(String(password)));
      return 'เปลี่ยนรหัสผ่าน ' + username + ' สำเร็จ';
    }
  }
  return 'ไม่พบผู้ใช้ ' + username;
}

/* ====================== Sample data ====================== */

/** function ให้เรียกจาก editor เพื่อสร้างตัวอย่างลิฟท์: seedSampleLifts() */
function seedSampleLifts() {
  var sheet = getSheet(SHEET_LIFTS, true);
  if (!sheet) throw new Error('สร้าง sheet: ' + SHEET_LIFTS + ' ก่อน');
  if (sheet.getLastRow() > 1) return 'sheet มีข้อมูลอยู่แล้ว';
  var sample = [
      ['LIFT-0001', 'ลิฟท์อาคาร A ฝั่งหน้า', 'อาคาร A', 'ชั้น 1', 8, 'LIFT-0001', 'LIFT-0001-INSIDE'],
      ['LIFT-0002', 'ลิฟท์อาคาร B ฝั่งหลัง', 'อาคาร B', 'ชั้น 1', 5, 'LIFT-0002', 'LIFT-0002-INSIDE'],
      ['LIFT-0003', 'ลิฟท์หอพัก C', 'หอพัก C', 'ชั้น G', 12, 'LIFT-0003', 'LIFT-0003-INSIDE'],
  ];
  for (var i = 0; i < sample.length; i++) sheet.appendRow(sample[i]);
  return 'เพิ่มลิฟท์ตัวอย่าง ' + sample.length + ' ตัว';
}
