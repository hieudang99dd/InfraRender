# InfraRenderAI

Ứng dụng tạo phối cảnh kiến trúc và hạ tầng từ ảnh tham chiếu, với giao diện tiếng Việt. Frontend Next.js chạy trong trình duyệt; backend FastAPI lưu dự án và gọi dịch vụ AI bằng khóa đặt trên máy chủ.

## Chức năng

- So sánh **Ảnh gốc** và **Ảnh Render**, xem lớn và tải ảnh kết quả.
- Chọn bối cảnh, giao thông, ánh sáng; bổ sung từ khóa và ghi chú riêng.
- Tạo prompt tiếng Việt: `template` ghép theo thiết lập, `refine` dùng AI biên tập thiết lập, `vision` dùng AI phân tích ảnh gốc cùng thiết lập. Hai chế độ AI cần provider và có thể phát sinh phí.
- Gửi kích thước thật tới provider, xử lý ảnh về kích thước/tỷ lệ đã chọn và báo rõ kích thước thực nhận, cắt ảnh hay nội suy. Mức sáng tạo là chỉ dẫn trong prompt, không phải tham số điều khiển riêng của provider.
- Lưu workspace trong SQLite: tên dự án, ảnh gốc, prompt, thiết lập và lịch sử render. Kiểm tra `revision` tránh ghi đè thay đổi từ cửa sổ khác.
- Dọn ảnh không còn được dự án tham chiếu sau thời hạn lưu trữ; có API xem trước danh sách dọn dẹp.

Backend online, cấu hình provider hợp lệ, truy cập được model và render thành công là các trạng thái khác nhau. Kiểm tra model không tạo ảnh và không chứng minh một lần render thật sẽ thành công.

## Chạy trên Windows

Cần Python 3.11 trở lên và Node.js 22.18 trở lên. Chạy tại thư mục dự án:

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

Điền `OPENAI_API_KEY` trong `backend/.env` để dùng AI. Không đưa khóa vào frontend hoặc Git.

```powershell
./start.cmd
```

Mở [http://localhost:3000](http://localhost:3000). Backend mặc định tại `http://127.0.0.1:8000`. Launcher kiểm tra dịch vụ sẵn có, chỉ dừng tiến trình nó tự khởi động và lưu log trong `.run/`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1 -SmokeTest
```

Xem [hướng dẫn phát triển](docs/development.md) để chạy riêng từng dịch vụ và chọn cổng khác.

## Lưu trữ và phạm vi sử dụng

Mặc định dữ liệu nằm trong `backend/projects.sqlite3`, `backend/uploads/` và `backend/outputs/`. `INFRARENDER_DATA_DIR` chuyển cả ba vào thư mục khác; Docker dùng `/data` và cần volume bền vững. Ảnh còn được bất kỳ dự án nào tham chiếu được giữ lại. Ảnh không được tham chiếu và có tuổi file quá `INFRARENDER_RETENTION_DAYS` (mặc định 30) được xét dọn mỗi 24 giờ bởi chính backend (không có maintenance worker riêng).

Bản triển khai dành cho một cá nhân hoặc nhóm tin cậy dùng chung kho dự án. Token ứng dụng bảo vệ API thao tác nhưng chưa có tài khoản hay phân quyền theo người dùng. URL ảnh có tên ngẫu nhiên vẫn đọc được công khai bởi người biết URL; đây không phải kho ảnh riêng tư theo tài khoản.

## Kiểm tra mã nguồn

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
Push-Location backend
./.venv/Scripts/python.exe -m unittest discover -s tests -v
Pop-Location
```

Test provider dùng phản hồi mô phỏng, không thay thế một lần tạo prompt/render thật bằng tài khoản đã cấu hình.

## Triển khai

Có hai đường triển khai được hỗ trợ (chi tiết: `docs/deployment.md`):

**A. GitHub Pages + backend HTTPS riêng** — Mục tiêu frontend:
[https://hieudang99dd.github.io/InfraRender/](https://hieudang99dd.github.io/InfraRender/).
Pages chỉ phục vụ frontend tĩnh; backend FastAPI chạy riêng trên máy chủ Python có
HTTPS và ổ lưu trữ bền vững. Workflow Pages cần repository variable
`NEXT_PUBLIC_INFRARENDER_API_URL` chứa URL HTTPS của backend. Khóa provider và
`INFRARENDER_AUTH_PASS` chỉ cấu hình tại backend, không đưa vào biến public hoặc
bundle trình duyệt.

**B. Docker/Caddy self-host cùng origin** — `compose.deploy.yaml` chạy toàn bộ
stack (frontend static, backend, Caddy) trên một VPS. Caddy cấp HTTPS cho
`INFRARENDER_DOMAIN` và route `/api/*`, `/uploads/*`, `/outputs/*` sang backend;
frontend tĩnh gọi backend qua same-origin, không cần URL backend trong bundle.
Backup/restore an toàn (dừng writer ngắn, SHA-256 manifest): `ops/backup.sh` và
`ops/restore.sh`.

**Chưa xác nhận deployment production thật:** cần domain/URL backend thật, bí mật
cấu hình tại máy chủ và kiểm tra toàn bộ luồng từ trình duyệt. Xem mục "Kiểm tra
mã nguồn" và [hướng dẫn triển khai](docs/deployment.md). A real paid provider
end-to-end render is not executed by CI and has not been run in this environment.

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [API và giới hạn dữ liệu](docs/api-contract.md)
- [Phát triển và kiểm thử](docs/development.md)
- [Triển khai và khôi phục](docs/deployment.md)
- [Quy tắc cho agent](AGENTS.md)
