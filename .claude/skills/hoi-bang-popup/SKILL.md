---
name: hoi-bang-popup
description: Cách hỏi anh Hùng (CEO TQM) trong dự án zalo-agent-cli — mọi câu hỏi cần anh chọn hoặc duyệt đều hỏi bằng pop-up AskUserQuestion có nút bấm, không hỏi bằng chữ. Dùng mỗi khi sắp hỏi anh một quyết định — gộp PR, chọn phương án, đặt tên, mở quyền gửi, xác nhận làm tiếp, có/không — ở mọi lane (A nền tảng, B giao diện).
---

# Hỏi anh Hùng bằng pop-up

Anh Hùng hay dùng điện thoại và muốn bấm nút thay vì gõ trả lời. Vì vậy:

## Khi nào dùng

Mỗi khi cần anh **quyết định** để làm tiếp: gộp PR, chọn giữa các phương án, đặt tên, mở/tắt quyền
(đọc/gửi nhóm Zalo), đổi mã bí mật, chạy việc có tác động thật, "làm tiếp không?".

Không dùng cho: thông báo kết quả, hướng dẫn từng bước anh tự làm trên máy, hay khi anh đã quyết rồi.

## Cách dùng

1. Viết phần báo cáo ngắn trước (kết luận đầu tiên), rồi gọi **AskUserQuestion** — không kết thúc
   tin nhắn bằng câu hỏi dạng chữ.
2. Mỗi câu hỏi 2–4 lựa chọn, nhãn ngắn (1–5 chữ) tiếng Việt, mô tả một dòng nói rõ hệ quả.
3. Phương án đề xuất đặt **đầu tiên** và thêm "(Đề xuất)" vào nhãn.
4. Tối đa 4 câu hỏi một lần; gộp các câu liên quan vào một pop-up.
5. Việc có rủi ro (gửi tin vào nhóm thật, mở quyền gửi, xóa dữ liệu) luôn có lựa chọn "Chưa, để sau".
6. Anh chọn "Khác" và gõ chữ → làm theo nội dung anh gõ.

## Ví dụ

Gộp PR sau khi rà soát:
- Câu hỏi: "Gộp PR #13 (phần mềm desktop) vào main?"
- Lựa chọn: "Gộp ngay (Đề xuất)" — test đạt, chưa ảnh hưởng dịch vụ đang chạy · "Chưa, để sau" — giữ PR mở.
