# AstroX — Dashboard quản trị

Trang quản trị nội bộ cho `dashboard.theastrox.space`: xem danh sách người dùng
đã từng lưu hồ sơ trên AstroX và bật/tắt quyền truy cập từng module
(Tử Vi, Cung Hoàng Đạo, Kinh Dịch, Bát Tự, Thần Số Học) cho từng tài khoản.

## Vì sao là một Cloudflare Pages project RIÊNG

`dashboard.theastrox.space` là một sub-domain riêng, không phải một đường dẫn
con của site AstroX chính — Cloudflare Pages gắn custom domain vào gốc của
từng project, nên cách đơn giản và chắc chắn nhất là tạo một **project Pages
thứ hai**, trỏ vào cùng D1 database `astrox-db` để đọc/ghi chung dữ liệu.

## Vì sao mật khẩu không nằm trong index.html

Mật khẩu quản trị **không được nhúng trong HTML/JS phía trình duyệt** — bất kỳ
ai bấm "Xem nguồn trang" cũng đọc được. Thay vào đó `functions/api/admin/access.js`
(chạy trên máy chủ Cloudflare) so sánh mật khẩu người dùng gõ vào với biến môi
trường `ADMIN_PASSWORD`, nên giá trị thật không nằm trong mã nguồn công khai.

**Lưu ý:** đây vẫn là một lớp bảo vệ đơn giản (một mật khẩu tĩnh dùng chung,
không phải tài khoản admin riêng biệt có audit log). Đủ dùng để chặn người
ngoài, nhưng ai biết mật khẩu đều có toàn quyền — cân nhắc đổi mật khẩu định kỳ.

## Các bước triển khai

1. Chạy migration D1 (bảng `user_module_access`, `users`) — đã thực hiện qua
   Cloudflare D1 Console.
2. Repo này chính là nội dung cần deploy.
3. Tạo Cloudflare Pages project trỏ vào repo này. Không cần build command,
   thư mục publish là gốc.
4. Bind D1: Project Settings → Functions → D1 database bindings → thêm
   binding tên `DB`, chọn database `astrox-db`.
5. Đặt biến môi trường ADMIN_PASSWORD (đánh dấu Secret).
6. Gắn custom domain `dashboard.theastrox.space`.
7. Mở `https://dashboard.theastrox.space`, nhập mật khẩu quản trị.

## Vì sao KHÔNG cần Supabase Service Role Key

Danh sách người dùng lấy từ bảng D1 `users` — được ghi bởi chính
`functions/api/user-data.js` của project AstroX chính mỗi khi có ai gọi API
đó thành công bằng token của họ (đã tự xác thực, không cần quyền admin nào
thêm). Vì vậy dashboard hiển thị được email thật mà KHÔNG cần đưa Supabase
Service Role Key (một secret rất nhạy cảm, có toàn quyền trên toàn bộ tài
khoản Supabase) vào project quản trị này.

## Giới hạn hiện tại

- Tài khoản có dữ liệu hồ sơ (`user_data`) từ TRƯỚC khi bảng `users` được
  tạo, nhưng chưa đăng nhập lại sau đó, sẽ hiện trong danh sách với tên lấy
  từ hồ sơ nhưng chưa có email — email sẽ tự điền khi họ đăng nhập lại.

