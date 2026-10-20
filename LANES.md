# Chia lane làm việc — TQM Zalo Agent

Nhiều phiên Claude cùng làm một repo. Mỗi lane chỉ sửa phần của mình; nguồn chuẩn duy nhất là `main` trên GitHub.

| Lane | Ai | Phạm vi | Việc chính |
| --- | --- | --- | --- |
| **A. Nền tảng** | Phiên cloud "ZALO CLI" | `src/`, `scripts/`, `integrations/`, `docs/` (trừ `docs/desktop-*`), `skill/`, `.github/` | Dịch vụ Zalo (MCP), khóa an toàn, chuyển tin sang Sheet, script Windows, bảo mật. Rà soát mọi PR đụng phạm vi này |
| **B. Giao diện** | Phiên trên máy, repo `G:\07_TQM_ZALO_AGENT_DESKTOP` | `desktop/`, `docs/desktop-*` | Phần mềm "TQM Zalo Agent" (Electron): trình hướng dẫn, màn hình quản trị, khay đồng hồ, đóng gói `.exe` |
| **C. Vận hành & quyết định** | Anh Hùng | Máy Windows, Zalo thật, Google Sheet | Chạy script, thử tầng 6–7, duyệt gộp PR, quyết định tính năng |

Dự án `G:\09_TQM_ZALO_AI_OPERATION_HUB` là dự án riêng: **không dùng chung số Zalo** với dự án này.

## 8 quy tắc

1. **Nguồn chuẩn là `main`.** Đầu mỗi phiên: `git fetch origin && git merge origin/main` trước khi làm.
2. **Mọi thay đổi qua PR**, đạt `npm run test:7` (tầng 1–5) mới gộp. Không đẩy thẳng lên `main`.
3. **Lane B cần sửa phần nền** (thêm/đổi route, cấu hình, script) → PR **riêng**, ghi rõ trong mô tả, lane A rà soát. Không trộn vào PR giao diện.
4. **Giao kèo giữa hai lane** là API của dịch vụ: [`docs/service-api.md`](docs/service-api.md). Đổi API = sửa file đó trong cùng PR.
5. **Dịch vụ thật chỉ chạy từ `G:\07_TQM_ZALO_AGENT_RUNTIME`** (bản `main`, cập nhật bằng `move-to-g.ps1`). Thư mục DESKTOP chỉ để phát triển/thử.
6. **Dữ liệu chỉ trên ổ G** (`ZALO_AGENT_HOME` = `G:\07_TQM_ZALO_AGENT_DATA`), kể cả dữ liệu Electron (`%ZALO_AGENT_HOME%\desktop`). Không ghi vào ổ C.
7. **Mỗi số Zalo chỉ một phiên đang chạy.** Phần mềm desktop không tự đăng nhập Zalo song song với dịch vụ: dừng dịch vụ → `zalo-agent login` → `restart-service.ps1`.
8. **Báo cáo theo mẫu TQM** (7 mục, kết luận trước); chi tiết kỹ thuật để trong mô tả PR. **Cần anh quyết định → hỏi bằng pop-up** (AskUserQuestion, skill `hoi-bang-popup`), không hỏi bằng chữ.

## Code trên cloud, máy chỉ để chạy

Phiên chạy trên máy anh (Claude Code / Desktop) dùng chung hạn mức theo giờ với mọi việc khác trên máy và đã bị
dừng giữa chừng vì hết hạn mức (20/10). Phiên cloud chạy trên máy chủ, không cần máy anh bật và có hạn mức riêng
(theo quan sát ngày 20/10 — có thể thay đổi).

| Việc | Làm ở đâu |
| --- | --- |
| Viết / sửa code, test, PR, rà soát (lane A **và** lane B) | **Phiên cloud** gắn repo GitHub |
| Chạy script trên Windows (`move-to-g.ps1`, `restart-service.ps1`, `sheets-check.ps1`), quét QR, bấm UAC | **Máy anh** — anh tự chạy, hoặc phiên trên máy khi anh ngồi ở máy |
| Xem / thử giao diện Electron, chụp màn hình | **Máy anh**, sau khi `git pull` |
| Kiểm tra bot từ xa | Phiên cloud đọc Google Sheet (trang Zalo, Trạng thái) |

Giữ mỗi phiên gọn: việc lớn mới → phiên mới với lời bàn giao ngắn (đọc `LANES.md`, `docs/service-api.md`, PR liên
quan) thay vì kéo dài một phiên rất dài. Phiên trên máy không tự chạy dịch vụ thật từ thư mục DESKTOP.

## Đặt tên nhánh

`core/<việc>` cho lane A, `desktop/<việc>` cho lane B, `fix/<việc>` cho sửa lỗi gấp (ghi lane trong mô tả PR).

## Không bao giờ

- Mở quyền gửi cho mọi nhóm (`group:*` trong `sendThreads`), hay thêm nút làm việc đó trên giao diện.
- In mã bí mật (Sheet token, MCP token, cookie Zalo) ra màn hình, log, ảnh chụp hay commit.
- Tắt / bỏ qua test để qua CI.
