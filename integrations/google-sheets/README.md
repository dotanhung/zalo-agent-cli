# Zalo → Google Sheets

Mỗi tin nhắn trong các nhóm thuộc `watchThreads` được công cụ Zalo (MCP) gửi sang một Google Apps Script,
script ghi thành một dòng trong trang tính **Zalo**. Nhóm ngoài `watchThreads` không bao giờ được gửi đi.

Cột: Thời gian · Nhóm · Mã nhóm · Người gửi · Mã người gửi · Nội dung · Loại · Mã tin.

## 1. Tạo Sheet và script (một lần)

1. Tạo Google Sheet mới (ví dụ "ZALO LOG – 100 BOT HCNS").
2. **Tiện ích mở rộng → Apps Script**. Xóa hết, dán toàn bộ `Code.gs` (**không sửa gì trong code**). Chỉ để một file.
3. **Cài đặt dự án** (bánh răng, cột trái) → **Thuộc tính tập lệnh** → **Thêm thuộc tính**:
   tên `TOKEN`, giá trị = mã bí mật (lấy bằng `sheets-check.ps1 -CopyToken`, xem dưới). Lưu.
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web** (Thực thi: **Tôi** · Truy cập: **Bất kỳ ai**),
   chép **URL ứng dụng web**. Chỉ giữ **một** bản triển khai.

Đổi mã sau này: chỉ sửa Thuộc tính tập lệnh `TOKEN` — **không** cần dán code hay triển khai lại.
Sửa `Code.gs`: **Quản lý bản triển khai → ✏️ → Phiên bản mới**, URL giữ nguyên.

## Cảnh báo bot chết (một lần, ~1 phút)

Dịch vụ gửi **nhịp tim** mỗi 15 phút (`forward.heartbeat`, `"0"` = tắt) vào cùng địa chỉ; trang **Trạng thái**
trong Sheet hiện lần cuối, Zalo có kết nối không, số lần kết nối lại.

Bật email cảnh báo: trong Apps Script chọn hàm **setupWatchdog** ở thanh trên → **Chạy** → cấp quyền
(gửi email, chạy theo lịch). Từ đó cứ 10 phút kiểm tra; **quá 30 phút** không có nhịp tim, hoặc Zalo mất kết nối
→ email cho chủ Sheet; khi bot sống lại → email "đã hoạt động lại". Mỗi sự cố chỉ gửi một email.
Trang kiểm tra (`doGet`) hiện `lastHeartbeat` và `watchdog: true` khi đã bật.

## Trang "Việc cần làm" và email 17h

Tin có dạng **giao việc / phiếu chi, lương / hợp đồng, báo giá / cần xác nhận** (nhận theo từ khóa trong
`TASK_RULES`, không dùng AI) tự được chép sang trang **Việc cần làm** với cột **Trạng thái** (Chưa làm / Đang làm /
Xong). `setupWatchdog` cũng bật email **17h mỗi ngày** liệt kê việc chưa "Xong". Chỉ đọc và ghi Sheet — không gửi gì
vào Zalo. Muốn Claude tổng hợp có ngữ cảnh: skill `bao-cao-viec-zalo`.

## 2. Khai báo trong mcp-config.json

Mục `forward` gồm `url` (URL ứng dụng web) và `token` (mã bí mật).

## Kiểm tra nhanh (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\sheets-check.ps1
```

In ra phiên bản code Apps Script đang chạy, tên Sheet nhận dữ liệu, và "vân tay" (8 ký tự đầu SHA-256) của mã
ở hai phía — không in mã thật. Đúng khi thấy `Ma KHOP` và `Ghi thu: OK`.
Thêm `-CopyToken` để chép mã trong mcp-config.json vào clipboard. Mở URL ứng dụng web trên trình duyệt cũng
thấy trang kiểm tra này.

## 3. Thử

Nhắn 3 tin vào nhóm được phép → Sheet có đúng 3 dòng mới trong vài giây. Nhắn vào nhóm khác → không có dòng nào.

## Lưu ý

- Chỉ ghi khi công cụ Zalo đang chạy. Muốn ghi 24/7 trên Windows: `docs/windows-service.md`.
- Mỗi lần công cụ khởi động / kết nối lại, các tin gần nhất được gửi lại: `historyBackfillPages` trang (mặc định 5)
  **chung cho mọi nhóm**, không phải 2 tuần mỗi nhóm — nhóm nhắn dày có thể chiếm hết, nhóm khác chỉ có tin mới;
  script bỏ qua mã tin đã có trong cột "Mã tin", nên tin bị lỡ được ghi bù mà không trùng.
- Sửa `Code.gs` xong phải **Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới**, URL giữ nguyên.
