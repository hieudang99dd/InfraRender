# Triển khai InfraRenderAI

## Trạng thái và kiến trúc

Mục tiêu frontend là `https://hieudang99dd.github.io/InfraRender/`, repository `hieudang99dd/InfraRender`. Cấu hình trong repo chuẩn bị static build và backend riêng; **chưa có bằng chứng triển khai production hoàn tất**. Cần backend HTTPS thật, bí mật cấu hình ở host, GitHub Pages được bật và kiểm tra toàn bộ luồng có provider thật.

```text
GitHub Actions → frontend/out → GitHub Pages /InfraRender/
                                      ↓ HTTPS, CORS, token ứng dụng
                           FastAPI trên Python host
                                      ↓
                           Provider AI + volume lưu dữ liệu
```

GitHub Pages không chạy FastAPI. Không đưa provider key hoặc token ứng dụng vào repository variable public, `.env` frontend hay JavaScript bundle.

## Backend

Chọn host hỗ trợ Python 3.11+, HTTPS, biến môi trường bí mật và ổ lưu trữ bền vững. Reverse proxy cần cho phép upload tối thiểu 20 MiB cộng phần multipart, request AI lâu hơn 180 giây và tải PNG tới 32 MiB. Triển khai một instance với một volume chứa database và ảnh; không tăng replica dùng filesystem riêng.

Cấu hình runtime:

| Biến                          | Giá trị / ý nghĩa                                                  |
| ----------------------------- | ------------------------------------------------------------------ |
| `INFRARENDER_ENV`             | `production`                                                       |
| `INFRARENDER_ACCESS_TOKEN`    | Token ngẫu nhiên ít nhất 32 ký tự, cấp riêng cho nhóm tin cậy      |
| `INFRARENDER_PUBLIC_BASE_URL` | URL HTTPS thật của backend, gồm prefix proxy nếu có                |
| `INFRARENDER_CORS_ORIGINS`    | `https://hieudang99dd.github.io` — origin không gồm `/InfraRender` |
| `INFRARENDER_DATA_DIR`        | Thư mục trên volume bền vững, Docker dùng `/data`                  |
| `INFRARENDER_RETENTION_DAYS`  | `30` mặc định, nhận 1–3650                                         |
| `OPENAI_API_KEY`              | Provider key, chỉ đặt trong secret/environment của backend host    |
| `OPENAI_IMAGE_MODEL`          | `gpt-image-2` mặc định; cần quyền trong tài khoản                  |
| `OPENAI_PROMPT_MODEL`         | `gpt-4o-mini` mặc định cho refine/vision                           |
| `OPENAI_BASE_URL`             | `https://api.openai.com/v1` mặc định                               |
| `PORT`                        | Cổng nội bộ host cấp, Docker mặc định `8000`                       |

`OPENAI_VISION_MODEL` còn được đọc như tên model prompt tương thích cũ nếu chưa đặt `OPENAI_PROMPT_MODEL`. Không cần đặt cả hai. Provider thay thế phải hỗ trợ định dạng endpoints image edit, kiểm tra model, chat completion và JSON schema mà adapter đang dùng; không mặc định mọi API tương thích đều hoạt động.

Backend từ chối startup production nếu token quá ngắn, thiếu public HTTPS URL hoặc CORS rỗng/wildcard. Host phải cấu hình origin production đúng; CORS không thay thế xác thực.

### Docker

Từ thư mục gốc:

```powershell
docker build -t infrarender-backend ./backend
docker volume create infrarender-data
```

Image chạy user UID `10001`, ghi vào `/data`. Mount volume phải cho UID này quyền ghi. Thiết lập biến/secret bằng giao diện hoặc cơ chế secret của host, rồi chạy image với volume tại `/data`. Nếu dùng file env local để thử container, file phải được Git bỏ qua và phải chứa `INFRARENDER_ENV=production`; đừng dùng nguyên cấu hình development để ghi đè chế độ production của image.

Docker khởi động `python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"`. Healthcheck gọi `/api/health`; host terminate HTTPS ở phía trước container. Cần build và chạy container trên host để xác minh; Dockerfile tự nó chưa chứng minh triển khai thành công.

Không dùng Docker thì cài `backend/requirements.txt`, chạy từ thư mục `backend/`:

```text
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Thay cổng theo host. Giữ secrets ở runtime, không chép vào image. `backend/.dockerignore` loại `.env*`, môi trường ảo, database, ảnh và cache khỏi build context.

### Lưu trữ và phạm vi truy cập

`INFRARENDER_DATA_DIR` chứa `projects.sqlite3`, `uploads/`, `outputs/`. Mặc định local là thư mục `backend/` để giữ ảnh cũ. Dữ liệu trên filesystem tạm của host sẽ mất khi redeploy; phải gắn volume bền vững.

Đây là ứng dụng cho một nhóm tin cậy dùng chung token và kho dự án. Chưa có tài khoản hay phân quyền từng dự án. Media `/uploads/...`, `/outputs/...` đọc công khai qua URL có tên UUID; người biết URL có thể tải ảnh. Token bảo vệ API thao tác, không biến URL ảnh thành tài nguyên riêng tư theo người dùng.

Retention mặc định dọn file không được tham chiếu có tuổi quá 30 ngày, xét mỗi 24 giờ. Ảnh dự án đang dùng được giữ. API cleanup có chế độ xem trước; xóa dự án hoặc file qua API thay vì xóa filesystem tùy ý.

## Frontend GitHub Pages

1. Triển khai backend và lấy URL HTTPS thật.
2. Trong repository, tạo **Actions variable** `NEXT_PUBLIC_INFRARENDER_API_URL` bằng URL này. Đây là địa chỉ công khai, không phải secret/token.
3. Trong Settings → Pages chọn source **GitHub Actions**. Nếu repo private, kiểm tra tài khoản/plan có hỗ trợ Pages cho repo đó; không tự đổi visibility.
4. Push thay đổi đã kiểm tra lên `main` hoặc chạy `frontend-pages.yml` thủ công trên `main`.

Workflow chạy `npm ci`, test, lint, typecheck, build và kiểm tra `out/index.html`, `out/_next`. Thiếu URL backend sẽ fail; URL không phải HTTPS/không hợp lệ bị cấu hình Next từ chối. Pull request chỉ kiểm tra/build, không deploy. Deploy chỉ chạy ở nhánh `main` khi build thành công.

`INFRARENDER_PAGES=true` đặt base path cố định `/InfraRender`, `trailingSlash=true`, tắt image optimizer cần server. Không suy base path từ `GITHUB_ACTIONS`, tránh vô tình đổi đường dẫn trong kiểm thử local.

Có thể kiểm tra build thủ công trong PowerShell bằng URL backend thật:

```powershell
$env:INFRARENDER_PAGES = 'true'
$env:NEXT_PUBLIC_INFRARENDER_API_URL = 'https://your-backend.example.com'
npm.cmd --prefix frontend run build
```

URL trên là placeholder cần thay. Build đóng URL vào bundle; đổi backend cần build/deploy lại. Phục vụ artifact dưới `/InfraRender/`, không dùng `next start`. Khi trở lại local dev, bỏ biến `INFRARENDER_PAGES` hoặc đặt `false`.

Backend có workflow riêng `backend-checks.yml` chạy `python -m unittest discover -s tests -v` trên push/PR liên quan backend. Workflow này kiểm tra code, không tự chọn host hay triển khai backend.

## Xác minh sau triển khai

- Mở URL Pages trên một thiết bị không chạy dịch vụ local; xác nhận CSS, JavaScript, icon và refresh dưới `/InfraRender/`.
- Kiểm tra backend `/api/health`, origin CORS và phản hồi `401` khi thiếu token ở API thao tác.
- Nhập token ứng dụng vào UI. Provider key không xuất hiện trong request browser, bundle hay log.
- Upload ảnh hợp lệ, tạo prompt `template`, rồi kiểm tra `refine`/`vision` bằng provider đã cấu hình.
- Render thật; đối chiếu kích thước thực nhận, xử lý nội suy/cắt, xem ảnh và tải PNG.
- Reload/mở lại dự án; kiểm tra tên, ảnh nguồn, prompt, thiết lập và lịch sử.
- Xem trước cleanup; xác nhận ảnh đang được dự án tham chiếu không nằm trong danh sách dọn.

Kiểm thử mô phỏng hoặc trang chủ tải được chưa đủ chứng minh luồng production. Các hành động AI thật có thể phát sinh phí; không tự retry để kiểm tra một cách mù quáng.

## Sao lưu và rollback

Sao lưu database và ảnh cùng thời điểm. Với sao chép file thông thường, dừng backend trước để tránh SQLite đang ghi. Giữ bản sao ngoài volume của dịch vụ. Khôi phục cả database và ảnh, không chỉ một phía.

Rollback frontend bằng commit đã biết ổn định rồi chạy lại workflow với URL backend phù hợp. Rollback backend bằng image/revision trước, giữ volume hiện tại hoặc khôi phục bản sao tương thích nếu có thay đổi schema. Không đưa bí mật vào commit rollback.
