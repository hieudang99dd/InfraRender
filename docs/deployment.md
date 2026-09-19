# Triển khai InfraRenderAI

## Trạng thái

Repo chuẩn bị sẵn code, CI, Docker/Compose/Caddy, ops scripts và tài liệu cho hai
đường triển khai (mục dưới). **Chưa có bằng chứng deployment production thật hoàn
tất** từ môi trường này: cần domain/URL backend thật, bí mật cấu hình ở host, GitHub
Pages được bật và kiểm tra toàn bộ luồng có provider thật. Real paid provider
end-to-end render is executed neither by CI nor in this environment.

## Hai đường triển khai

**A. GitHub Pages + backend HTTPS riêng**

```text
GitHub Actions → frontend/out → GitHub Pages /InfraRender/
                                      ↓ HTTPS, CORS, Basic auth (app)
                           FastAPI trên Python host
                                      ↓
                           Provider AI + volume lưu dữ liệu
```

Frontend static export gọi backend qua `NEXT_PUBLIC_INFRARENDER_API_URL` (đóng vào
bundle lúc build). GitHub Pages không chạy FastAPI. Không đưa provider key hoặc mật
khẩu truy cập vào repository variable public, `.env` frontend hay JavaScript bundle.

**B. Docker/Caddy self-host cùng origin**

```text
Browser → https://INFRARENDER_DOMAIN
                ├─ /api/*, /uploads/*, /outputs/* → Caddy → backend:8000
                └─ /* → Caddy → frontend:3000 (nginx static)
```

`compose.deploy.yaml` là đường production canonical cho self-host: frontend static
(nginx non-root), backend FastAPI và Caddy; image được publish lên GHCR bởi
`docker-publish.yml`, triển khai bằng `ops/deploy.sh`. Frontend không chứa URL
backend — trình duyệt gọi same-origin, Caddy route API/media sang backend. Test
tự động cho routing này chạy trong CI (`compose.test.yaml` với
`INFRARENDER_DOMAIN=localhost`, internal CA).

## Backend

Chọn host hỗ trợ Python 3.11+, HTTPS, biến môi trường bí mật và ổ lưu trữ bền vững. Reverse proxy cần cho phép upload tối thiểu 20 MiB cộng phần multipart, request AI lâu hơn 180 giây và tải PNG tới 32 MiB. Triển khai một instance với một volume chứa database và ảnh; không tăng replica dùng filesystem riêng.

Cấu hình runtime:

| Biến                          | Giá trị / ý nghĩa                                                  |
| ----------------------------- | ------------------------------------------------------------------ |
| `INFRARENDER_ENV`             | `production`                                                       |
| `INFRARENDER_AUTH_USER`       | Tài khoản truy cập, mặc định `hieu.dv`                             |
| `INFRARENDER_AUTH_PASS`       | Mật khẩu ít nhất 12 ký tự, cấp riêng cho nhóm tin cậy              |
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

Backend từ chối startup production nếu password quá ngắn, thiếu public HTTPS URL hoặc CORS rỗng/wildcard. Host phải cấu hình origin production đúng; CORS không thay thế xác thực.

### Docker

**Local stack** (cho máy dev, toàn bộ service build từ source):

```powershell
docker compose -f compose.yaml -f compose.local.yaml up -d --build
```

- `compose.local.yaml` bật `INFRARENDER_ENV=development` (không yêu cầu auth/HTTPS);
- nginx trong image frontend route `/api/*`, `/uploads/*`, `/outputs/*` sang backend
  để trình duyệt dùng same-origin ngay cả khi không có Caddy.

**Production stack** (image GHCR, Caddy TLS, auth bắt buộc): `compose.deploy.yaml`.

```text
cp .env.example .env        # điền INFRARENDER_DOMAIN, resource limits
mkdir -p secrets
printf '%s' '<openai-key>' > secrets/openai_api_key.txt
printf '%s' '<app-password-12+-chars>' > secrets/infrarender_auth_pass.txt
chmod 600 secrets/*.txt
bash ops/preflight.sh
bash ops/deploy.sh <full-40-char-git-sha>
```

`ops/preflight.sh` kiểm tra `.env`, các secret file, Docker daemon, Compose, format
domain và cấu hình `compose.deploy.yaml`. `ops/deploy.sh` kéo image, recreate
service, chờ HTTPS health và ghi tag thành công vào `.deploy-current`.

Backend image chạy user UID `10001`, ghi vào `/data` (volume `infrarender_data`).
Chỉ cấu hình secrets qua Docker secrets/environment của host; không đưa
`INFRARENDER_ENV=development` vào host env vì image đã set `production`.

### Lưu trữ và phạm vi truy cập

`INFRARENDER_DATA_DIR` chứa `projects.sqlite3`, `uploads/`, `outputs/`. Mặc định local là thư mục `backend/` để giữ ảnh cũ. Dữ liệu trên filesystem tạm của host sẽ mất khi redeploy; phải gắn volume bền vững.

Đây là ứng dụng cho một nhóm tin cậy dùng chung token và kho dự án. Chưa có tài khoản hay phân quyền từng dự án. Media `/uploads/...`, `/outputs/...` đọc công khai qua URL có tên UUID; người biết URL có thể tải ảnh. Token bảo vệ API thao tác, không biến URL ảnh thành tài nguyên riêng tư theo người dùng.

Retention của file media không được tham chiếu: `INFRARENDER_RETENTION_DAYS` (mặc
định 30, 1–3650), quét mỗi 24 giờ bởi **chính backend** (không có maintenance
worker riêng từ v0.6). Ảnh dự án đang dùng được giữ. API cleanup có chế độ xem
trước; xóa dự án hoặc file qua API thay vì xóa filesystem tùy ý.

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

**Backup:** `ops/backup.sh [backup_root]`. Script dừng mọi container dùng volume
`infrarender_data` (thường chỉ backend), tar toàn bộ volume (SQLite + uploads +
outputs) — vì writer đã dừng nên DB, WAL và media khớp cùng một thời điểm — rồi
restart qua `EXIT` trap và chờ healthy. Kết quả gồm `infrarender_data.tar.gz`,
`SHA256SUMS` và `metadata.txt`. Sao lưu cũ hơn `INFRARENDER_BACKUP_RETENTION_DAYS`
bị dọn sau một backup thành công. Giữ bản sao ngoài VPS hoặc dùng snapshot provider.

**Restore:** `CONFIRM_RESTORE=yes bash ops/restore.sh <backup-dir>` — yêu cầu dừng
stack trước (`docker compose -f compose.deploy.yaml down`), xác minh SHA-256, kiểm
tra layout archive (phải có `projects.sqlite3`, `uploads/`, `outputs/`) và từ chối
nếu volume còn đang được container dùng. Sau restore: start stack và chạy
`bash ops/production-check.sh`.

Rollback frontend bằng commit đã biết ổn định rồi chạy lại workflow Pages/`deploy.sh`
với tag phù hợp. Rollback backend bằng image SHA trước (`bash ops/rollback.sh`),
giữ volume hoặc khôi phục bản sao tương thích. Không đưa bí mật vào commit rollback.
