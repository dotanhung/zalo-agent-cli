---
name: test-7-tang
description: Quy trình kiểm thử 7 tầng cho zalo-agent-cli — chạy tầng 1–5 tự động bằng scripts/test-7-tang.sh, hướng dẫn thử tay tầng 6–7 trên số Zalo phụ, báo kết quả dạng bảng. Dùng trước mỗi commit/PR/gộp vào main, sau khi nâng cấp thư viện, trước khi cài lên máy thật hoặc VPS, và khi anh nói "test 7 tầng", "kiểm thử", "chạy test", "kiểm tra trước khi gộp", "test đủ chưa".
---

# Kiểm thử 7 tầng — zalo-agent-cli

Mỗi thay đổi phải đi qua đủ các tầng theo thứ tự. Tầng dưới trượt thì dừng, sửa xong mới lên tầng trên.
Không bao giờ báo "ĐẠT" cho tầng chưa chạy; tầng thử tay chưa làm thì ghi "CHƯA THỬ".

## Bảng 7 tầng

| Tầng | Nội dung | Cách chạy | Đạt khi |
|---|---|---|---|
| 1 | Tĩnh: lint, định dạng | tự động | `eslint` và `prettier --check` sạch |
| 2 | Đơn vị + tích hợp giả lập | tự động | `npm test` 0 bài trượt (Zalo API được giả lập, không cần đăng nhập) |
| 3 | Hợp đồng CLI | tự động | `--version` và `--help` của cả 20 nhóm lệnh chạy được |
| 4 | Bảo mật | tự động | `npm audit` 0 lỗ hổng high/critical; không file bí mật (`cred_*.json`, `.env`, `*.pem`, `*.key`, nhật ký gửi) trong git; khóa gửi tin MCP đạt |
| 5 | Đóng gói | tự động | `npm pack` không chứa bí mật, có đủ file; cài từ tarball và `zalo-agent --version` đúng phiên bản |
| 6 | Thử thật trên số Zalo phụ | thử tay | đủ checklist tầng 6 bên dưới |
| 7 | Vận hành (máy thật / VPS) | thử tay | đủ checklist tầng 7 bên dưới |

## Chạy tầng 1–5

```bash
npm run test:7              # tầng 1–5
bash scripts/test-7-tang.sh 2 4   # chỉ tầng 2 và 4
```

Script in bảng Markdown và dòng `KẾT LUẬN: ĐẠT/TRƯỢT`, mã thoát khác 0 khi có tầng trượt.
Khi tầng trượt: đọc phần lỗi in ra stderr, sửa tận gốc, chạy lại đúng tầng đó rồi chạy lại cả 1–5.
Không được tắt, bỏ qua hay xóa bài kiểm thử để qua tầng.

Viết bài kiểm thử mới theo `TEST.md` (node:test, file `*.test.js` đặt cạnh file nguồn). Mỗi tính năng hoặc bản sửa lỗi phải có bài kiểm thử ở tầng 2; với bản sửa lỗi, chứng minh bài kiểm thử trượt khi bỏ bản sửa.

## Tầng 6 — thử thật trên số Zalo phụ (thử tay)

Chỉ dùng **số Zalo phụ** và **nhóm thử nghiệm**. Không thử trên nhóm khách hàng hay nhóm nội bộ thật.

- [ ] `zalo-agent login` quét QR thành công; `zalo-agent whoami` đúng tài khoản phụ
- [ ] Tắt và mở lại → tự đăng nhập, không phải quét QR lại
- [ ] `zalo-agent msg send <id> "Thử tiếng Việt có dấu" -t 1` → tin hiện đúng trên điện thoại
- [ ] `zalo-agent listen --save ./zalo-logs` → gửi 5 tin từ điện thoại, file JSONL có đủ 5 dòng; Ctrl+C thoát sạch
- [ ] `zalo-agent msg history <id> -t 1` khớp nội dung trên điện thoại
- [ ] MCP với `"readOnly": true`: Claude tóm tắt nhóm thử nghiệm đúng; Claude **không có** lệnh gửi tin
- [ ] MCP với `"sendThreads": ["group:<nhóm thử>"]`: gửi vào nhóm thử được; gửi sang nhóm khác bị `Send blocked`
- [ ] `~/.zalo-agent-cli/mcp-send-log.jsonl` ghi đủ cả lần `sent` và `blocked`

## Tầng 7 — vận hành (thử tay, trước khi chạy thật)

- [ ] Chạy dưới systemd/pm2; `kill` tiến trình → tự chạy lại trong 10 giây
- [ ] Mất mạng 1 phút rồi có lại → tự kết nối lại, không phải đăng nhập lại
- [ ] MCP HTTP có `--auth`: gọi không mã → 401; có mã → vào được; chỉ nghe `127.0.0.1` hoặc sau HTTPS
- [ ] Quyền file `~/.zalo-agent-cli/credentials/*` và nhật ký gửi là `600`
- [ ] Đã sao lưu thư mục `~/.zalo-agent-cli/credentials/` ở nơi an toàn
- [ ] Chỉ **một** client MCP chạy cho mỗi tài khoản Zalo

## Báo kết quả

Báo ngắn, kết luận trước, theo mẫu:

```
KẾT LUẬN: ĐẠT tầng 1–5 · tầng 6–7 CHƯA THỬ
| Tầng | Kết quả | Ghi chú |
|---|---|---|
| 1 Tĩnh | ĐẠT | |
| 2 Đơn vị + tích hợp | ĐẠT | 239 bài |
| 3 Hợp đồng CLI | ĐẠT | |
| 4 Bảo mật | ĐẠT | 0 lỗ hổng |
| 5 Đóng gói | ĐẠT | |
| 6 Thử thật | CHƯA THỬ | cần anh quét QR số phụ |
| 7 Vận hành | CHƯA THỬ | |
Việc anh cần làm: ...
```

Chỉ gộp vào `main` khi tầng 1–5 ĐẠT. Chỉ dùng cho nhóm thật khi tầng 6 ĐẠT. Chỉ chạy liên tục trên VPS khi tầng 7 ĐẠT.
