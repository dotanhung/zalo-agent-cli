# Chạy công cụ Zalo thường trực trên Windows

Mặc định Claude Code tự bật công cụ Zalo theo từng phiên chat, đóng phiên là công cụ tắt
(tin đến lúc đó không vào Google Sheet). Script dưới đây biến nó thành dịch vụ chạy nền:

- Tự bật khi đăng nhập Windows, chạy ẩn, tự chạy lại sau 1 phút nếu lỗi (Task Scheduler: `ZaloAgentMCP`).
- Nghe tại `http://127.0.0.1:3847` (chỉ trong máy), có mã truy cập.
- Claude Code nối vào dịch vụ thay vì tự bật bản riêng → luôn chỉ một phiên Zalo.
- Mỗi lần khởi động/kết nối lại, công cụ gửi lại các tin gần đây của nhóm được phép; Sheet bỏ qua tin đã có
  (theo cột "Mã tin") nên tin bị lỡ được ghi bù, không trùng.

## Cài

1. Đóng mọi phiên Claude Code.
2. Mở **PowerShell bằng quyền Administrator**, rồi:

```powershell
cd C:\Users\Admin\zalo-agent-cli
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-service.ps1
```

Kết quả đúng: `Dich vu dang chay: http://127.0.0.1:3847/health` và `claude mcp get zalo` báo `Type: http`, `Connected`.

## Kiểm tra

| Việc | Lệnh |
| --- | --- |
| Dịch vụ còn sống | `Invoke-RestMethod http://127.0.0.1:3847/health` |
| Trạng thái task | `Get-ScheduledTask ZaloAgentMCP \| Get-ScheduledTaskInfo` |
| Xem log | `Get-Content "$HOME\.zalo-agent-cli\service\mcp-http.log" -Tail 30 -Encoding UTF8` |
| Khởi động lại (sau khi sửa mcp-config.json hoặc git pull) | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\restart-service.ps1` — đúng khi `uptime` dưới 120 giây. Không dùng riêng `Stop-ScheduledTask`: nó không tắt tiến trình node bên trong |

## Gỡ

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-service.ps1
```

Claude Code quay về tự bật công cụ theo phiên.

## Lưu ý

- Chỉ chạy khi tài khoản Windows đang đăng nhập (máy khóa màn hình vẫn chạy; tắt máy / đăng xuất thì dừng).
- Không chạy tay `zalo-agent mcp start` hay `zalo-agent listen` cùng lúc: sẽ giành phiên Zalo.
- `service\http-token.txt` và `service\run-hidden.vbs` chứa mã truy cập; chỉ tài khoản của anh đọc được.
- Mở Zalo Web (chat.zalo.me) bằng cùng số sẽ đá dịch vụ ra; dịch vụ tự thử lại mỗi phút.
