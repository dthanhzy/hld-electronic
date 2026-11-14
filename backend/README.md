# Backend HLD Electronic

Express + SQLite. Giữ API key Gemini ở server, quản lý sản phẩm, tồn kho, đơn hàng, yêu cầu hỗ trợ/bảo hành, chẩn đoán sự cố và chat AI.

Yêu cầu: Node 22.5 trở lên (SQLite có sẵn trong Node, không cần cài thêm).

## Chạy trên máy

```
npm install
copy .env.example .env     (điền GEMINI_API_KEY và ADMIN_PASSWORD)
npm start
```
Kiểm tra logic: `npm test` (dùng database tạm, không đụng dữ liệu thật).

Dữ liệu đơn hàng nằm ở `data/shop.db` (tự tạo). Muốn xoá sạch dữ liệu thử: tắt server, xoá thư mục `data`.

Sản phẩm (tên, giá, mô tả, thông số) sửa trong `data.js`, rồi khởi động lại server. Tồn kho do database quản lý, đổi bằng API quản trị.

## API công khai

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra server |
| GET | `/api/products`, `/api/products/:id` | Sản phẩm kèm thông số, tồn kho |
| POST | `/api/recommend` | Gợi ý cấu hình loa |
| GET | `/api/faults`, `/api/faults/:id` | Danh sách / chi tiết sự cố |
| POST | `/api/diagnose` | Chẩn đoán theo từ khoá |
| POST | `/api/orders` | Đặt hàng (server tự tính tiền, trừ tồn kho) |
| GET | `/api/orders/:code?phone=...` | Tra cứu đơn, cần đúng mã và số điện thoại |
| POST | `/api/support` | Gửi yêu cầu hỗ trợ / bảo hành |
| POST | `/api/chat` | Chat AI |

Đặt hàng:
```json
{ "name": "Nguyễn Văn A", "phone": "0912345678", "address": "12 Lê Lợi, Quận 1, TP.HCM",
  "note": "Giao giờ hành chính", "items": [ { "productId": "bt05", "qty": 2 } ] }
```
Hỗ trợ:
```json
{ "name": "Lan", "phone": "0987654321", "symptom": "Loa kêu rè khi mở lớn", "productId": "bt05", "faultId": "meo" }
```

## Tài khoản nhân viên và API quản trị

Lần chạy đầu (chưa có tài khoản nào), server tạo quản trị viên từ `ADMIN_USERNAME` và `ADMIN_PASSWORD` trong `.env`. Hãy đăng nhập `admin.html`, đổi mật khẩu và tạo tài khoản riêng cho từng nhân viên.

- Mật khẩu được băm bằng scrypt, không lưu dạng chữ thường. Phiên đăng nhập hết hạn sau 12 giờ.
- Sai mật khẩu 5 lần thì tài khoản bị khoá 15 phút (quản trị viên có thể mở khoá).
- Vai trò `staff`: xử lý đơn, yêu cầu hỗ trợ, xem phản hồi AI. Vai trò `admin`: thêm tồn kho, quản lý nhân viên, xem nhật ký.
- Mọi thao tác quan trọng được ghi vào bảng nhật ký (xem ở tab "Nhật ký").

Đăng nhập: `POST /api/admin/login` với `{"username":"...","password":"..."}` trả về `token`. Các API còn lại gửi kèm header `Authorization: Bearer <token>`.

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/admin/login` | công khai | Đăng nhập, nhận token |
| GET | `/api/admin/me` | nhân viên | Thông tin người đang đăng nhập |
| POST | `/api/admin/logout` | nhân viên | Đăng xuất |
| POST | `/api/admin/password` | nhân viên | Đổi mật khẩu: `{"current":"...","next":"..."}` |
| GET | `/api/admin/orders?status=moi` | nhân viên | Danh sách đơn |
| PATCH | `/api/admin/orders/:code` | nhân viên | Đổi trạng thái: `{"status":"da_xac_nhan"}` |
| GET | `/api/admin/support?status=moi` | nhân viên | Danh sách yêu cầu hỗ trợ |
| PATCH | `/api/admin/support/:id` | nhân viên | Đổi trạng thái: `{"status":"dang_xu_ly"}` |
| GET | `/api/admin/feedback` | nhân viên | Phản hồi về câu trả lời của AI |
| PATCH | `/api/admin/products/:id` | quản trị | Đặt tồn kho: `{"stock": 15}` |
| GET/POST | `/api/admin/staff` | quản trị | Danh sách / thêm nhân viên |
| PATCH | `/api/admin/staff/:id` | quản trị | Đổi vai trò, vô hiệu hoá, đặt lại mật khẩu, mở khoá |
| GET | `/api/admin/audit` | quản trị | Nhật ký thao tác |

## Telegram và QR chuyển khoản
- Điền `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` để nhận tin nhắn khi có đơn mới hoặc yêu cầu hỗ trợ mới.
- Điền `BANK_CODE`, `BANK_ACCOUNT` (và `BANK_ACCOUNT_NAME`) để trang web hiện mã QR VietQR sau khi khách đặt hàng. Việc xác nhận đã nhận tiền vẫn do nhân viên làm thủ công.

Trạng thái đơn: `moi` → `da_xac_nhan` → `dang_giao` → `hoan_tat`, hoặc `huy` (hoàn lại tồn kho). Không lùi trạng thái.
Trạng thái hỗ trợ: `moi`, `dang_xu_ly`, `da_xong`.

Ví dụ trong PowerShell (thay token bằng giá trị nhận được khi đăng nhập):
```
$l = Invoke-RestMethod http://localhost:3000/api/admin/login -Method Post -ContentType "application/json" -Body '{"username":"admin","password":"MAT_KHAU_CUA_BAN"}'
$h = @{ Authorization = "Bearer $($l.token)" }
Invoke-RestMethod http://localhost:3000/api/admin/orders -Headers $h
```

## Lưu ý khi làm frontend

Dữ liệu khách nhập (tên, địa chỉ, ghi chú) được lưu nguyên văn. Khi hiển thị lên trang, luôn dùng `textContent` hoặc hàm `esc()`, không gán thẳng vào `innerHTML`.

## Tra cứu web khi chẩn đoán (AI_WEB_SEARCH)
Khi câu hỏi không khớp kho lỗi cục bộ, AI dùng Google Search (qua Gemini) để tìm trang kỹ thuật sửa loa, tổng hợp cách xử lý và `/api/chat` trả thêm `sources` (danh sách link). Nếu tra web lỗi, server tự gọi lại không tra web. Đặt `AI_WEB_SEARCH=0` trong `.env` để tắt.
Lưu ý: AI không "học vĩnh viễn" từ web; mỗi lần hỏi nó tra cứu rồi trả lời. Kho lỗi trong `data.js` vẫn là nền tảng tin cậy nhất.
