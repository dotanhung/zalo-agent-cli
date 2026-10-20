/**
 * Zalo → Google Sheets: nhận tin từ zalo-agent-cli (MCP, mục "forward" trong mcp-config.json)
 * và ghi mỗi tin thành một dòng.
 *
 * Cài: Tiện ích mở rộng → Apps Script → dán toàn bộ file này (KHÔNG cần sửa gì) →
 *      Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh → thêm TOKEN = mã bí mật →
 *      Triển khai → Ứng dụng web (Thực thi: Tôi · Truy cập: Bất kỳ ai).
 * TOKEN phải trùng "forward.token" trong ~/.zalo-agent-cli/mcp-config.json.
 * Đổi mã sau này: chỉ sửa Thuộc tính tập lệnh, KHÔNG cần triển khai lại.
 * Mở URL ứng dụng web trên trình duyệt để xem trang kiểm tra (phiên bản, Sheet, vân tay mã).
 * Cảnh báo bot chết + email việc hằng ngày (một lần): chọn hàm setupWatchdog → Chạy → cấp quyền.
 * Từ đó cứ 10 phút kiểm tra; quá 30 phút không có nhịp tim (hoặc Zalo mất kết nối) → email cho anh;
 * 17h mỗi ngày → email các việc chưa xong ở trang "Việc cần làm".
 */

const SCRIPT_VERSION = '5';
const TASK_SHEET = 'Việc cần làm';
const TASK_STATUSES = ['Chưa làm', 'Đang làm', 'Xong'];
const DIGEST_HOUR = 17; // giờ gửi email tóm tắt việc mỗi ngày
/** Nhận diện tin là việc cần làm (theo từ khóa, không gọi AI). Thứ tự = ưu tiên. */
const TASK_RULES = [
  { loai: 'Phiếu chi / lương', re: /phiếu chi|phiếu lương|lương ứng|tạm ứng|hoa hồng|thanh toán|chi tiền/i },
  { loai: 'Hợp đồng / báo giá', re: /hợp đồng|báo giá|dự thảo/i },
  { loai: 'Cần xác nhận', re: /xác nhận|phê duyệt|duyệt/i },
  { loai: 'Giao việc', re: /giao việc|nhờ |yêu cầu|soạn|làm phiếu|làm hồ sơ|deadline|hạn chót/i },
];
const STATUS_SHEET = 'Trạng thái';
const ALERT_AFTER_MIN = 30; // không thấy nhịp tim quá ngần này phút → email cảnh báo
const SHEET_NAME = 'Zalo';
const HEADERS = ['Thời gian', 'Nhóm', 'Mã nhóm', 'Người gửi', 'Mã người gửi', 'Nội dung', 'Loại', 'Mã tin'];

/** Mã bí mật lấy từ Thuộc tính tập lệnh "TOKEN" (đọc lúc chạy, không cần triển khai lại khi đổi). */
function token_() {
  return String(PropertiesService.getScriptProperties().getProperty('TOKEN') || '').trim();
}

/** 8 ký tự đầu SHA-256 của mã: để so khớp mà không lộ mã. */
function fingerprint_(s) {
  if (!s) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.slice(0, 4).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** Trang kiểm tra: mở URL ứng dụng web trên trình duyệt. */
function doGet() {
  const t = token_();
  return json_({
    ok: true,
    version: SCRIPT_VERSION,
    spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
    tokenSet: t.length > 0,
    tokenFingerprint: fingerprint_(t),
    lastHeartbeat: lastHeartbeat_(),
    watchdog: ScriptApp.getProjectTriggers().some(function (tr) { return tr.getHandlerFunction() === 'checkHeartbeat'; }),
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  const expected = token_();
  if (!expected) return json_({ ok: false, error: 'TOKEN not set in Script Properties' });
  if (body.token !== expected) return json_({ ok: false, error: 'unauthorized' });
  if (body.heartbeat) {
    saveHeartbeat_(body.heartbeat);
    return json_({ ok: true, heartbeat: true });
  }
  // Một tin (tin mới đến) hoặc cả lô (ghi bù sau khi công cụ khởi động lại)
  const list = Array.isArray(body.messages) ? body.messages : body.message ? [body.message] : [];
  const valid = list.filter(function (m) { return m && m.msgId && m.threadId; });
  if (valid.length === 0) return json_({ ok: false, error: 'missing msgId/threadId' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    const seen = existingIds_(sh); // chống trùng vĩnh viễn: đọc cột "Mã tin"
    const rows = [];
    valid
      .sort(function (a, b) { return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0); })
      .forEach(function (m) {
        const id = String(m.msgId);
        if (seen[id]) return;
        seen[id] = true;
        rows.push([
          new Date(Number(m.timestamp) || Date.now()),
          safe_(m.threadName),
          "'" + m.threadId,
          safe_(m.senderName),
          "'" + (m.senderId || ''),
          safe_(m.text),
          safe_(m.type),
          "'" + id,
        ]);
      });
    if (rows.length > 0) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      addTasks_(rows);
    }
    return json_({ ok: true, added: rows.length, duplicate: valid.length - rows.length });
  } finally {
    lock.releaseLock();
  }
}

/** Tập mã tin đã có trong cột H. */
function existingIds_(sh) {
  const seen = {};
  const last = sh.getLastRow();
  if (last < 2) return seen;
  sh.getRange(2, 8, last - 1, 1).getDisplayValues().forEach(function (r) {
    if (r[0]) seen[String(r[0]).replace(/^'/, '')] = true;
  });
  return seen;
}

/** Lấy (hoặc tạo) trang tính "Zalo" có dòng tiêu đề. */
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }
  return sh;
}

/** Chặn chèn công thức: nội dung bắt đầu bằng = + - @ được ghi như chữ thường. */
function safe_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Nhịp tim & cảnh báo ---------------- */

function lastHeartbeat_() {
  const raw = PropertiesService.getScriptProperties().getProperty('LAST_HEARTBEAT');
  return raw ? JSON.parse(raw) : null;
}

/** Lưu nhịp tim (chỉ các trường đã biết) và cập nhật trang "Trạng thái". */
function saveHeartbeat_(hb) {
  const beat = {
    at: Number(hb.at) || Date.now(),
    receivedAt: Date.now(),
    uptimeSec: Number(hb.uptimeSec) || 0,
    zaloConnected: hb.zaloConnected === true,
    lastConnectedAt: Number(hb.lastConnectedAt) || null,
    reconnectCount: Number(hb.reconnectCount) || 0,
  };
  PropertiesService.getScriptProperties().setProperty('LAST_HEARTBEAT', JSON.stringify(beat));
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(STATUS_SHEET) || ss.insertSheet(STATUS_SHEET);
  sh.getRange(1, 1, 5, 2).setValues([
    ['Nhịp tim gần nhất', new Date(beat.receivedAt)],
    ['Zalo đang kết nối', beat.zaloConnected ? 'Có' : 'KHÔNG'],
    ['Dịch vụ chạy liên tục (giờ)', Math.round(beat.uptimeSec / 360) / 10],
    ['Số lần kết nối lại', beat.reconnectCount],
    ['Cảnh báo khi im lặng quá (phút)', ALERT_AFTER_MIN],
  ]);
}

/** Chạy theo lịch 10 phút: email khi bot im lặng / mất Zalo, và khi hoạt động lại. */
function checkHeartbeat() {
  const props = PropertiesService.getScriptProperties();
  const hb = lastHeartbeat_();
  const now = Date.now();
  let problem = null;
  if (!hb) problem = 'chưa nhận được nhịp tim nào từ dịch vụ Zalo';
  else if (now - hb.receivedAt > ALERT_AFTER_MIN * 60000)
    problem = 'không nhận được nhịp tim ' + Math.round((now - hb.receivedAt) / 60000) + ' phút (dịch vụ hoặc máy có thể đã tắt)';
  else if (!hb.zaloConnected) problem = 'dịch vụ còn chạy nhưng Zalo KHÔNG kết nối';

  const alerted = props.getProperty('ALERTED') === '1';
  const sheetName = SpreadsheetApp.getActiveSpreadsheet().getName();
  const to = Session.getEffectiveUser().getEmail();
  if (problem && !alerted) {
    MailApp.sendEmail(to, '[TQM Zalo Agent] Bot có vấn đề',
      'Sheet "' + sheetName + '": ' + problem + '.\n\nKiểm tra trên máy: powershell -ExecutionPolicy Bypass -File G:\\07_TQM_ZALO_AGENT_RUNTIME\\scripts\\windows\\restart-service.ps1');
    props.setProperty('ALERTED', '1');
  } else if (!problem && alerted) {
    MailApp.sendEmail(to, '[TQM Zalo Agent] Bot đã hoạt động lại', 'Sheet "' + sheetName + '": đã nhận lại nhịp tim, Zalo đang kết nối.');
    props.deleteProperty('ALERTED');
  }
  return problem;
}

/** Chạy MỘT lần trong trình soạn thảo: kiểm tra bot 10 phút/lần + email việc lúc 17h (chạy lại không tạo trùng). */
function setupWatchdog() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    const fn = tr.getHandlerFunction();
    if (fn === 'checkHeartbeat' || fn === 'sendDailyDigest') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('checkHeartbeat').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(DIGEST_HOUR).create();
  return 'Đã bật kiểm tra 10 phút/lần và email việc lúc ' + DIGEST_HOUR + 'h';
}

/* ---------------- Việc cần làm ---------------- */

/** Loại việc của một nội dung tin, hoặc null nếu không phải việc. */
function taskType_(text) {
  const t = String(text || '');
  if (!t || t.charAt(0) === '[') return null; // ảnh/file/sự kiện hệ thống
  for (let i = 0; i < TASK_RULES.length; i++) if (TASK_RULES[i].re.test(t)) return TASK_RULES[i].loai;
  return null;
}

function taskSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TASK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TASK_SHEET);
    sh.appendRow(['Thời gian', 'Nhóm', 'Người gửi', 'Nội dung', 'Loại', 'Trạng thái', 'Mã tin']);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
    sh.getRange('F2:F').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TASK_STATUSES, true).build());
  }
  return sh;
}

/** Chép các dòng tin mới là việc sang trang "Việc cần làm" (bỏ qua mã tin đã có). */
function addTasks_(rows) {
  const picked = rows.filter(function (r) { return taskType_(String(r[5]).replace(/^'/, '')); });
  if (picked.length === 0) return 0;
  const sh = taskSheet_();
  const seen = {};
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 7, last - 1, 1).getDisplayValues().forEach(function (r) { seen[r[0]] = true; });
  const out = [];
  picked.forEach(function (r) {
    const id = String(r[7]).replace(/^'/, '');
    if (seen[id]) return;
    seen[id] = true;
    out.push([r[0], r[1], r[3], r[5], taskType_(String(r[5]).replace(/^'/, '')), TASK_STATUSES[0], "'" + id]);
  });
  if (out.length > 0) sh.getRange(sh.getLastRow() + 1, 1, out.length, 7).setValues(out);
  return out.length;
}

/** Theo lịch 17h: email các việc chưa "Xong" (mới nhất trước). */
function sendDailyDigest() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASK_SHEET);
  if (!sh || sh.getLastRow() < 2) return 0;
  const open = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues()
    .filter(function (r) { return r[5] !== 'Xong'; })
    .reverse();
  if (open.length === 0) return 0;
  const lines = open.slice(0, 50).map(function (r, i) {
    return (i + 1) + '. [' + r[4] + '] ' + r[0] + ' · ' + r[1] + ' · ' + r[2] + ': ' + r[3] + ' (' + r[5] + ')';
  });
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    '[TQM Zalo Agent] ' + open.length + ' việc chưa xong',
    'Từ Sheet "' + SpreadsheetApp.getActiveSpreadsheet().getName() + '", trang "' + TASK_SHEET + '":\n\n' +
      lines.join('\n') + (open.length > 50 ? '\n… và ' + (open.length - 50) + ' việc khác.' : '') +
      '\n\nĐổi cột Trạng thái thành "Xong" để không nhắc lại.');
  return open.length;
}
