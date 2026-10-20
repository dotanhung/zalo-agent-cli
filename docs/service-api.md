# API dịch vụ Zalo (giao kèo giữa lane A và lane B)

Dịch vụ: `zalo-agent mcp start --http 3847 --auth <token>`, chạy thường trực bằng Task Scheduler `ZaloAgentMCP`
(`scripts/windows/install-service.ps1`). Chỉ nghe `127.0.0.1`.

## Xác thực

- Mọi route **trừ `/health`** đòi header `Authorization: Bearer <token>`; thiếu/sai → `401 {"error":"Unauthorized"}`.
  Middleware gắn ở cấp app nên route mới thêm sau nó được bảo vệ tự động.
- Token nằm ở `%ZALO_AGENT_HOME%\service\http-token.txt` (chỉ tài khoản Windows đọc được).
- Dịch vụ **phải** chạy với `--auth`; không có `--auth` thì mọi route mở — chỉ dùng khi thử trên máy dev.

## Route

| Route | Auth | Mô tả |
| --- | --- | --- |
| `GET /health` | Không | `{status:"ok", uptime:<giây>, threads:<số thread có tin chờ trong buffer>}` |
| `POST /mcp` | Có | MCP Streamable HTTP, stateless (mỗi request một server mới) |
| `/admin/*` | Có | Chưa có trên `main` — do lane B đề xuất qua PR, phải ghi vào bảng này khi gộp |

## Công cụ MCP

| Tool | Ghi chú |
| --- | --- |
| `zalo_get_messages`, `zalo_list_threads`, `zalo_mark_read`, `zalo_view_media` | Chỉ buffer tin mới của thread thuộc `watchThreads` |
| `zalo_get_history`, `zalo_search_history` | Lịch sử (backfill ~2 tuần + tin mới); thread ngoài `watchThreads` bị từ chối / lọc bỏ |
| `zalo_search_threads` | Ẩn thread ngoài `watchThreads` |
| `zalo_send_message` | Không đăng ký khi `readOnly: true`; chỉ gửi tới `sendThreads` (không khai báo = các mã **cụ thể** trong `watchThreads`, không kế thừa `group:*`/`dm:*`); mọi lần gửi ghi `mcp-send-log.jsonl` |

## Cấu hình — `%ZALO_AGENT_HOME%\mcp-config.json`

| Khóa | Ý nghĩa |
| --- | --- |
| `watchThreads` | Thread được đọc/ghi lịch sử/chuyển Sheet. `group:<id>`, `dm:<id>`, `group:*`, `dm:*` |
| `sendThreads` | Thread được gửi. `[]` = cấm hết. `null`/không có = mã cụ thể trong `watchThreads` (wildcard không được kế thừa). Không bao giờ `group:*` |
| `readOnly` | `true` = không có tool gửi |
| `sendLog` | Đường dẫn nhật ký gửi; `false` = tắt |
| `forward.url` / `forward.token` / `forward.timeout` | Chuyển tin sang Google Apps Script (https) |

File JSON hỏng → dịch vụ **dừng** (fail closed), không quay về mặc định. Sửa cấu hình xong: `restart-service.ps1`.

## Chuyển tin (forward)

`POST forward.url` với `{"token": "...", "message": {...}}` (tin mới) hoặc `{"token": "...", "messages": [...]}`
(ghi bù sau mỗi lần kết nối). Mỗi tin: `msgId, threadId, threadType, threadName, senderId, senderName, text,
timestamp (ms), type`. Phía nhận trả `{"ok":true,"added":n,"duplicate":m}` hoặc `{"ok":false,"error":"..."}`;
bỏ qua `msgId` đã có. Apps Script mẫu: `integrations/google-sheets/Code.gs` (token ở Script Properties `TOKEN`).

## Thư mục dữ liệu — `%ZALO_AGENT_HOME%` (`G:\07_TQM_ZALO_AGENT_DATA`)

| Đường dẫn | Chứa |
| --- | --- |
| `credentials\`, `accounts.json` | Đăng nhập Zalo (bí mật) |
| `mcp-config.json` | Cấu hình ở trên |
| `mcp-send-log.jsonl` | Nhật ký gửi |
| `media\` | Ảnh/file tải về |
| `service\` | `http-token.txt`, `run-hidden.vbs`, `mcp-http.log` |
| `oa\` | Dữ liệu Zalo OA |
| `desktop\` | Dữ liệu phần mềm desktop (lane B) |
