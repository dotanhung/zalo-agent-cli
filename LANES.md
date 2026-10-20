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

## Đặt tên nhánh

`core/<việc>` cho lane A, `desktop/<việc>` cho lane B, `fix/<việc>` cho sửa lỗi gấp (ghi lane trong mô tả PR).

## Không bao giờ

- Mở quyền gửi cho mọi nhóm (`group:*` trong `sendThreads`), hay thêm nút làm việc đó trên giao diện.
- In mã bí mật (Sheet token, MCP token, cookie Zalo) ra màn hình, log, ảnh chụp hay commit.
- Tắt / bỏ qua test để qua CI.
