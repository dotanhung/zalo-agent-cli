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
 */

const SCRIPT_VERSION = '3';
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
