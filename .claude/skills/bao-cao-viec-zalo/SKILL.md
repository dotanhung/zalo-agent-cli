---
name: bao-cao-viec-zalo
description: Tổng hợp việc cần làm từ tin nhắn các nhóm Zalo được phép (giao việc, phiếu chi/lương, hợp đồng/báo giá, cần xác nhận) thành báo cáo ngắn cho anh Hùng, chỉ đọc — không gửi gì vào Zalo. Dùng khi anh hỏi "hôm nay có việc gì", "tổng hợp việc trong nhóm", "ai giao việc gì", "phiếu chi nào chờ duyệt", "báo cáo việc từ Zalo".
---

# Báo cáo việc từ tin nhắn Zalo

Chỉ **đọc**. Không gọi `zalo_send_message`, không trả lời trong nhóm, kể cả khi anh nói "nhắc họ đi" —
khi đó hỏi lại bằng pop-up (skill `hoi-bang-popup`) trước.

## Lấy dữ liệu

1. `zalo_search_threads` / `zalo_list_threads` → các nhóm được theo dõi (chỉ thấy nhóm trong `watchThreads`).
2. `zalo_search_history` với `since` = đầu ngày (hoặc khoảng anh hỏi), mỗi nhóm một lượt; lật trang bằng `cursor`
   tới khi `hasMore` = false.
3. Nếu có Google Sheet ZALO LOG: trang **Việc cần làm** đã được Apps Script tự lọc theo từ khóa, kèm cột
   Trạng thái anh cập nhật — ưu tiên dùng trạng thái ở đó.

## Phân loại

| Loại | Dấu hiệu |
| --- | --- |
| Phiếu chi / lương | phiếu chi, phiếu lương, lương ứng, tạm ứng, hoa hồng, thanh toán, chi tiền |
| Hợp đồng / báo giá | hợp đồng, báo giá, dự thảo |
| Cần xác nhận | xác nhận, duyệt, phê duyệt |
| Giao việc | giao việc, nhờ, yêu cầu, soạn, làm phiếu/hồ sơ, deadline |

Đọc cả ngữ cảnh: tin trả lời "ok/đã xong" sau một việc → đánh dấu có thể đã xong. Không bịa người làm hay hạn
chót nếu tin không nói.

## Báo cáo (mẫu TQM, kết luận trước)

```
KẾT LUẬN: 5 việc mới hôm nay, 2 phiếu chi chờ anh duyệt.
| # | Loại | Ai giao | Nội dung | Giờ | Nhóm |
|---|---|---|---|---|---|
...
Cần anh quyết: (nếu có → pop-up)
```

Số tiền, tên người, tên công trình: chép đúng như trong tin, không làm tròn hay suy đoán.
