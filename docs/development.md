# Phát triển InfraRenderAI

## Môi trường và cài đặt

Cần Python 3.11 trở lên, Node.js 22.18 trở lên, Git và PowerShell. CI frontend dùng Node.js 24. Backend dùng `unittest`, không cần pytest cho bộ kiểm thử hiện tại.

Tại thư mục gốc dự án:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
```

Nếu chưa có cấu hình riêng:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Backend đọc `backend/.env`. Frontend đọc `.env.local` trong `frontend/`. Chỉ URL backend là biến public; khóa provider và mật khẩu truy cập không được đóng vào bundle frontend.

## Chạy local

```powershell
./start.cmd
```

Launcher khởi chạy FastAPI tại `127.0.0.1:8000` và Next dev tại cổng `3000`. Nó đặt `NEXT_PUBLIC_INFRARENDER_API_URL` để browser gọi trực tiếp, tắt chế độ Pages trong dev và thêm origin frontend vào CORS của backend do nó khởi động. Dịch vụ đã chạy giữ cấu hình hiện có; thay đổi cấu hình cần khởi động lại dịch vụ đó riêng.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1 -BackendPort 8001 -FrontendPort 3001
powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1 -SmokeTest
```

`-Check` chỉ kiểm tra dependencies. `-SmokeTest` kiểm tra trang frontend, health backend và CORS; không gọi AI, không xác nhận quyền render. Log nằm trong `.run/`. Launcher chỉ dừng tiến trình do nó khởi động.

Có thể chạy riêng hai terminal:

```powershell
# Terminal 1, từ thư mục gốc
Push-Location backend
./.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
Pop-Location
```

```powershell
# Terminal 2, từ thư mục gốc
npm.cmd --prefix frontend run dev
```

Mở `http://localhost:3000`. Health ở `http://127.0.0.1:8000/api/health`, không phải frontend API proxy. Nếu dùng cổng frontend khác khi chạy riêng, cập nhật `INFRARENDER_CORS_ORIGINS`.

## Sử dụng AI

`template` hoạt động khi chưa có provider key. `refine`, `vision` và render yêu cầu `OPENAI_API_KEY`. Model mặc định là `gpt-4o-mini` cho prompt và `gpt-image-2` cho ảnh; quyền sử dụng phụ thuộc tài khoản/provider.

Thay `.env` xong cần khởi động lại backend. Kiểm tra model không tạo ảnh. Tạo prompt AI/render có thể phát sinh phí. Unit test không phải bằng chứng tài khoản đã sẵn sàng render.

## Kiểm thử và build

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
Push-Location backend
./.venv/Scripts/python.exe -m unittest discover -s tests -v
Pop-Location
```

Chạy một nhóm từ `backend/`, ví dụ:

```powershell
./.venv/Scripts/python.exe -m unittest discover -s tests -p test_project_store.py -v
```

`next build` tạo `frontend/out/`. Đây là static export: không dùng `next start` để phục vụ bản build này. Dùng web server tĩnh phù hợp; bản Pages phải phục vụ dưới `/InfraRender/`. Xem [triển khai](deployment.md) để build đúng base path.

## Dữ liệu local

Mặc định giữ ảnh ở `backend/uploads/`, `backend/outputs/`, dự án ở `backend/projects.sqlite3`. Đặt `INFRARENDER_DATA_DIR` vào thư mục thử nghiệm trước khi khởi động để kiểm thử biệt lập. Không xóa ảnh thủ công khi dự án còn tham chiếu.

Khi đổi máy, Git không mang theo `.env`, ảnh và SQLite. Sao lưu dữ liệu riêng. Nếu sao lưu bằng cách sao chép file, dừng backend trước; khôi phục database và ảnh từ cùng thời điểm.

## Chẩn đoán nhanh

| Hiện tượng                     | Kiểm tra                                                                   |
| ------------------------------ | -------------------------------------------------------------------------- |
| Frontend mở nhưng API lỗi      | URL backend, health, CORS đúng origin/cổng                                 |
| Health xanh nhưng không render | Cấu hình renderer, quyền model, key/hạn mức                                |
| `401`                          | Tài khoản/mật khẩu ứng dụng sai, không dùng provider key làm thông tin đăng nhập frontend |
| Lưu dự án trả `409`            | Revision cũ hoặc ảnh đã mất; giữ bản nháp, mở bản máy chủ hoặc tải lại ảnh |
| Ảnh trả `404`                  | Volume/thư mục dữ liệu và tên file                                         |
| Build Pages từ chối            | URL backend HTTPS hợp lệ và `INFRARENDER_PAGES=true`                       |
| Ảnh có nội suy/cắt             | Xem metadata kích thước thực nhận và xử lý ảnh                             |
