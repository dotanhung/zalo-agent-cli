/**
 * Zalo → Google Sheets: nhận tin từ zalo-agent-cli (MCP, mục "forward" trong mcp-config.json)
 * và ghi mỗi tin thành một dòng.
 *
 * Cài: Tiện ích mở rộng → Apps Script → dán toàn bộ file này → đổi TOKEN →
 *      Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *      (Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai).
 * TOKEN phải trùng "forward.token" trong ~/.zalo-agent-cli/mcp-config.json.
 */

const TOKEN = 'DOI-THANH-MA-BI-MAT-DAI'; // đổi thành chuỗi ngẫu nhiên dài, không chia sẻ
const SHEET_NAME = 'Zalo';
const HEADERS = ['Thời gian', 'Nhóm', 'Mã nhóm', 'Người gửi', 'Mã người gửi', 'Nội dung', 'Loại', 'Mã tin'];

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  if (!TOKEN || TOKEN === 'DOI-THANH-MA-BI-MAT-DAI' || body.token !== TOKEN) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  const m = body.message || {};
  if (!m.msgId || !m.threadId) return json_({ ok: false, error: 'missing msgId/threadId' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = 'msg_' + m.msgId;
    if (cache.get(key)) return json_({ ok: true, duplicate: true });

    sheet_().appendRow([
      new Date(Number(m.timestamp) || Date.now()),
      safe_(m.threadName),
      "'" + m.threadId,
      safe_(m.senderName),
      "'" + (m.senderId || ''),
      safe_(m.text),
      safe_(m.type),
      "'" + m.msgId,
    ]);
    cache.put(key, '1', 21600); // 6 giờ: chống ghi trùng khi gửi lại
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
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
