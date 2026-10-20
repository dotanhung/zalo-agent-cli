# Zalo → Google Sheets

Mỗi tin nhắn trong các nhóm thuộc `watchThreads` được công cụ Zalo (MCP) gửi sang một Google Apps Script,
script ghi thành một dòng trong trang tính **Zalo**. Nhóm ngoài `watchThreads` không bao giờ được gửi đi.

Cột: Thời gian · Nhóm · Mã nhóm · Người gửi · Mã người gửi · Nội dung · Loại · Mã tin.

## 1. Tạo Sheet và script (một lần, ~5 phút)

1. Tạo Google Sheet mới (ví dụ "ZALO LOG – 100 BOT HCNS") trong thư mục Drive phù hợp.
2. **Tiện ích mở rộng → Apps Script**. Xóa nội dung mẫu, dán toàn bộ `Code.gs`.
3. Đổi dòng `const TOKEN = 'DOI-THANH-MA-BI-MAT-DAI';` thành một chuỗi ngẫu nhiên dài
   (ví dụ chạy `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` trong PowerShell). Lưu (Ctrl+S).
4. **Triển khai → Tùy chọn triển khai mới → biểu tượng bánh răng → Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai** (script tự kiểm tra TOKEN; không có TOKEN thì bị từ chối)
5. Bấm **Triển khai**, cấp quyền khi Google hỏi, chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/.../exec`).

URL + TOKEN là bí mật: ai có cả hai thì ghi được dòng giả vào Sheet (nhưng không đọc được Zalo).

## 2. Khai báo trong mcp-config.json

Thêm mục `forward` (giữ nguyên các mục khác). Ví dụ trên Windows PowerShell:

```powershell
$cfg = '{ "watchThreads": ["group:9115874644608778682"], "sendThreads": ["group:9115874644608778682"], "readOnly": false, "forward": { "url": "https://script.google.com/macros/s/XXXX/exec", "token": "MA-BI-MAT-O-BUOC-1" } }'
[System.IO.File]::WriteAllText("$HOME\.zalo-agent-cli\mcp-config.json", $cfg)
```

Mở phiên Claude Code mới. Log khởi động có dòng `Forwarding watched messages to script.google.com`.

## 3. Thử

Nhắn 3 tin vào nhóm được phép → Sheet có đúng 3 dòng mới trong vài giây. Nhắn vào nhóm khác → không có dòng nào.

## Lưu ý

- Chỉ ghi khi công cụ Zalo đang chạy. Muốn ghi 24/7 trên Windows: `docs/windows-service.md`.
- Mỗi lần công cụ khởi động / kết nối lại, các tin gần đây (cửa sổ Zalo cho lấy lại, khoảng 2 tuần) được gửi lại;
  script bỏ qua mã tin đã có trong cột "Mã tin", nên tin bị lỡ được ghi bù mà không trùng.
- Sửa `Code.gs` xong phải **Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới**, URL giữ nguyên.
