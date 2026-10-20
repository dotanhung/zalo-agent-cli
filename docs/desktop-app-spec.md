# SPEC — Zalo Agent Desktop (bản 0.1)

| Mục | Giá trị |
|---|---|
| Ngày | 2026-10-20 |
| Người duyệt | Anh Hùng (CEO TQM) |
| Repo | `dotanhung/zalo-agent-cli` (local: `G:\07_TQM_ZALO_AGENT_DESKTOP`) |
| Nhánh làm việc | `feat/desktop-app` (tạo local, **chưa push**) |
| Trạng thái | NHÁP — chờ duyệt |

---

## 1. Mục tiêu

Thay toàn bộ việc cấu hình bằng lệnh/JSON hiện nay bằng **một phần mềm cài đặt (.exe)** có giao diện:
đăng nhập Zalo, chọn nhóm, nối Google Sheet, nối Claude, xem trạng thái — tất cả bằng nút bấm.

**Không làm trong 0.1:** nhiều tài khoản Zalo, tự cập nhật, chữ ký số, bản macOS/Linux.

## 2. Vấn đề hiện tại (lý do làm)

| Vấn đề đã gặp hôm nay | Phần mềm giải quyết bằng |
|---|---|
| Tin chỉ vào Sheet khi phiên Claude đang mở | Dịch vụ chạy trong phần mềm, luôn bật, tự khởi động cùng Windows |
| Sửa `mcp-config.json` bằng tay, nhóm ghi bằng mã số | Màn hình tick chọn nhóm theo tên |
| Token Sheet lệch giữa máy và Apps Script → `unauthorized` | Nút "Tạo mã" + "Gửi thử" báo ngay OK / sai mã |
| Token, Bearer hiện nguyên văn trên terminal | Mã bí mật mã hóa bằng Windows, chỉ hiện `••••a1b2` |
| Hai tiến trình Zalo cùng tài khoản dễ bị đá | Một phần mềm duy nhất giữ kết nối Zalo; Claude nối vào qua HTTP |

## 3. Giao diện — kéo mẫu có sẵn từ GitHub

### 3.1 Mẫu chọn

| Vai trò | Repo | Lý do | Giấy phép |
|---|---|---|---|
| **Khung giao diện (chính)** | `satnaing/shadcn-admin` | Dashboard admin đẹp, sang, có sidebar, sáng/tối, bảng, form, trang cài đặt sẵn. React + Vite + Tailwind + shadcn/ui — **trùng stack repo đang dùng** (React 19, Vite, Tailwind 4) | MIT (kiểm lại khi kéo về) |
| Khung Electron | `electron-vite/electron-vite-react` | Ghép Electron + Vite + React, có sẵn cấu hình build `.exe` (electron-builder) | MIT (kiểm lại khi kéo về) |
| Bộ thành phần | `shadcn/ui` | Component copy vào repo, không phụ thuộc gói ngoài, dễ chỉnh theo màu TQM | MIT |
| Biểu tượng | `lucide-react` | Đi kèm shadcn | ISC |

**Cách kéo:** chỉ copy các phần cần (layout, sidebar, trang settings, component ui) vào `desktop/src/renderer/`, **không fork cả repo**, ghi nguồn + giấy phép vào `desktop/THIRD_PARTY.md`. Bỏ các trang mẫu không dùng (Tasks, Chats, Users, Clerk auth…).

### 3.2 Phong cách
- Nền sáng, sidebar tối; hỗ trợ chế độ tối theo Windows.
- Màu nhấn: xanh Zalo `#0068FF` cho trạng thái/nút chính; đỏ chỉ cho lỗi.
- Font: Be Vietnam Pro (hiển thị tiếng Việt chuẩn), cỡ 14px cho nội dung.
- Toàn bộ chữ trên giao diện bằng tiếng Việt có dấu.

## 4. Màn hình (bản 0.1)

### 4.1 Trình hướng dẫn lần đầu (4 bước, có thanh tiến độ)
1. **Đăng nhập Zalo** — hiện QR trên màn hình, tự chuyển bước khi quét xong; hiện tên + ảnh tài khoản.
2. **Chọn nhóm** — danh sách nhóm/bạn bè (tên thật, ô tìm kiếm có dấu/không dấu). Mỗi dòng 2 ô: **Theo dõi** / **Được gửi tin** (mặc định tắt).
3. **Google Sheet** — dán URL Apps Script → bấm **Tạo mã** (sinh token, nút Sao chép, hướng dẫn 3 dòng dán vào Script Properties) → bấm **Gửi thử** → hiện ✅ "Sheet nhận được" hoặc ❌ lý do (sai mã / sai URL / chưa deploy).
4. **Kết nối Claude** — bấm 1 nút: phần mềm tự chạy `claude mcp add` kiểu HTTP với mã truy cập riêng; hiện ✅ khi `claude mcp get zalo` báo Connected.

### 4.2 Sau khi cài (sidebar)
| Trang | Nội dung |
|---|---|
| **Tổng quan** | 4 ô trạng thái: Zalo (đã kết nối/đứt) · Google Sheet (lần ghi cuối, số tin chờ ghi bù) · Claude (đã nối/chưa) · Dịch vụ (thời gian chạy). Danh sách 20 tin gần nhất của nhóm theo dõi kèm cột "Đã vào Sheet ✅/⏳/❌" |
| **Nhóm** | Như bước 2, sửa bất cứ lúc nào, **có hiệu lực ngay** không cần khởi động lại |
| **Google Sheet** | URL, token (ẩn), Tạo mã mới, Gửi thử, Ghi bù ngay |
| **An toàn** | Công tắc **Chỉ đọc** (mặc định BẬT). Tắt chỉ đọc → hộp xác nhận. Bảng nhật ký gửi tin (đã gửi / bị chặn / lỗi) |
| **Nhật ký** | Log chạy trực tiếp, lọc lỗi, nút "Mở thư mục log" |
| **Tài khoản** | Tài khoản Zalo đang dùng, Đăng xuất, Đăng nhập lại |

### 4.3 Khay hệ thống (tray)
- Biểu tượng: xanh = mọi thứ OK; vàng = đang ghi bù / đang nối lại; đỏ = lỗi (Zalo đứt hoặc Sheet từ chối).
- Menu chuột phải: Mở · Ghi bù ngay · Tạm dừng nghe · Thoát.
- Đóng cửa sổ = thu xuống khay, không tắt dịch vụ.
- Thông báo Windows khi: Zalo bị đá ra, Sheet từ chối liên tiếp 3 lần.

## 5. Kiến trúc

> **Điều chỉnh khi triển khai 0.1 (2026-10-20, anh Hùng duyệt):** giữ dịch vụ chạy nền hiện có (Task Scheduler `ZaloAgentMCP`) làm "động cơ"; phần mềm là **bảng điều khiển** — đọc `/admin/status`, `/admin/threads` của dịch vụ, sửa `mcp-config.json` (có bản `.bak`), khởi động lại dịch vụ bằng `restart-service.ps1`. Luôn chỉ một kết nối Zalo. Giao diện kéo từ `shadcn-admin` (chỉ copy phần cần), điều hướng bằng state thay cho TanStack Router. Việc gói lõi Zalo vào trong .exe (sơ đồ dưới) để ở 0.2. Đăng nhập QR trong phần mềm cũng dời sang 0.2.

```
ZaloAgent.exe (Electron)
├─ Main process (Node)
│   ├─ ZaloService      ← tách từ src/commands/mcp.js thành module start()/stop()/status()
│   │   ├─ zca-js listener (1 kết nối Zalo duy nhất)
│   │   ├─ HistoryStore, MessageForwarder (ghi Sheet + ghi bù), SendGuard
│   │   └─ MCP HTTP server 127.0.0.1:3847 (Claude nối vào đây)
│   ├─ ConfigStore      ← đọc/ghi mcp-config.json, kiểm tra hợp lệ trước khi lưu, giữ bản sao .bak
│   ├─ SecretStore      ← token Sheet, Bearer MCP, cookie Zalo mã hóa bằng Electron safeStorage (DPAPI)
│   ├─ Tray + Auto-start (đăng ký "mở cùng Windows", ẩn cửa sổ)
│   └─ IPC API          ← kênh có kiểu rõ ràng giữa giao diện và main
└─ Renderer (React + shadcn-admin)
    └─ chỉ gọi IPC, không có quyền Node, contextIsolation = true
```

**Nguyên tắc:**
- Dùng lại code `src/mcp/*` hiện có, không viết lại logic Zalo/Sheet. CLI `zalo-agent` vẫn chạy như cũ.
- Một kết nối Zalo duy nhất trên máy: khi mở, phần mềm kiểm tra cổng 3847 và tác vụ `ZaloAgentMCP`; nếu dịch vụ cũ đang chạy → hỏi anh "Chuyển sang phần mềm?" rồi mới gỡ tác vụ cũ (không tự gỡ).
- Cấu hình vẫn ở `%USERPROFILE%\.zalo-agent-cli\` để tương thích CLI; riêng các mã bí mật chuyển sang SecretStore. Phần mềm không xóa file cũ — chỉ ghi chú "đã chuyển".

### 5.1 Cấu trúc thư mục mới trong repo
```
desktop/
  package.json            (electron, electron-builder, electron-vite)
  electron.vite.config.ts
  src/main/               (index.ts, zalo-service.ts, config-store.ts, secret-store.ts, tray.ts, ipc.ts)
  src/preload/index.ts
  src/renderer/           (React, phần copy từ shadcn-admin)
  resources/              (icon .ico, ảnh tray 3 màu)
  THIRD_PARTY.md
src/commands/mcp.js       (sửa: tách phần khởi động thành src/mcp/service.js để desktop gọi)
```

## 6. An toàn

| Quy tắc | Cách làm |
|---|---|
| Chỉ máy này truy cập | Server chỉ nghe `127.0.0.1`; Electron renderer không có Node |
| Không lộ mã | Không in token/Bearer ra log, giao diện chỉ hiện 4 ký tự cuối, nút Sao chép |
| Mặc định an toàn | Chỉ đọc = BẬT; "Được gửi tin" mặc định tắt cho mọi nhóm |
| Cấu hình sai không phá dịch vụ | Kiểm tra trước khi lưu; sai → giữ bản đang chạy, báo lỗi đỏ |
| Không xóa dữ liệu | Không xóa file cấu hình/log/media cũ; gỡ tác vụ cũ chỉ khi anh bấm xác nhận |
| Gửi tin có nhật ký | Mọi lần gửi/chặn đều ghi `mcp-send-log.jsonl`, xem được trên trang An toàn |

## 7. Đóng gói

- `electron-builder` → `ZaloAgent-Setup-0.1.0.exe` (NSIS, cài cho 1 người dùng, không cần Admin).
- Kích thước dự kiến 100–150 MB.
- Chưa ký số → Windows hiện "Unknown publisher" → bấm *More info → Run anyway* (dùng nội bộ).

## 8. Kiểm thử & tiêu chí nghiệm thu

**Tự động:** `npm test` (code cũ) + test mới cho ConfigStore, SecretStore, ZaloService start/stop + test-7-tang tầng 1–5.

**Thử tay trên máy anh (tầng 6–7, dùng nhóm 100 BOT HCNS):**

| # | Tiêu chí | Đạt khi |
|---|---|---|
| 1 | Cài từ file .exe | Mở được, không cần terminal |
| 2 | Đăng nhập QR | Quét xong hiện tên tài khoản |
| 3 | Gửi thử Sheet | Báo ✅, Sheet có dòng thử |
| 4 | Tin vào Sheet khi **không mở Claude** | Linh gửi 1 tin, Sheet có dòng trong ≤ 30 giây |
| 5 | Ghi bù | Tắt mạng 2 phút, gửi 2 tin, bật lại → cả 2 tin vào Sheet, không trùng |
| 6 | Khởi động lại máy | Phần mềm tự chạy, biểu tượng xanh |
| 7 | Claude dùng được | Phiên Claude mới đọc được tin nhóm qua `zalo_get_history` |
| 8 | Chỉ đọc | Khi BẬT, Claude không có công cụ gửi tin |
| 9 | Không lộ mã | Không thấy token/Bearer nguyên văn ở log hay màn hình |

## 9. Quy trình làm việc — local trước, GitHub sau

1. Tạo nhánh `feat/desktop-app` **trên máy**, commit từng bước nhỏ.
2. Chạy test tự động + build .exe local.
3. Anh cài thử trên máy, đi qua 9 tiêu chí ở mục 8.
4. **Chỉ khi anh duyệt** mới `git push` và mở PR vào `main`.
5. Bản chính của repo nay ở `G:\07_TQM_ZALO_AGENT_DESKTOP`. Bản cũ ở `C:\Users\Admin\zalo-agent-cli` giữ nguyên (dịch vụ đang chạy từ đó; có thay đổi chưa commit ở `src/index.js`). Chuyển dịch vụ sang ổ G là bước riêng, hỏi anh trước.

## 10. Lộ trình

| Bản | Nội dung | Ước lượng |
|---|---|---|
| 0.1 | Mục 4.1, 4.2 (Tổng quan, Nhóm, Google Sheet, An toàn cơ bản), tray, tự chạy cùng Windows, đóng gói .exe | 2–3 phiên |
| 0.2 | Nhật ký trực tiếp, thông báo Windows, mã PIN mở phần mềm | 1 phiên |
| 0.3 | Tự cập nhật, nhiều tài khoản Zalo, (tùy chọn) chữ ký số | 1–2 phiên |

## 11. Câu hỏi còn mở

1. Phần mềm tên gì trên Start Menu: "TQM Zalo Agent" hay "Zalo Agent"?
2. Có logo TQM để làm icon không, hay dùng icon tạm?
3. Thay đổi chưa commit ở `C:\Users\Admin\zalo-agent-cli\src\index.js` là của ai — có cần đưa sang bản ổ G không?
