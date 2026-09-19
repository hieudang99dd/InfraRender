# SKILL_InfraRenderAI_Production_Agent

## 1. Mục đích

Skill này định nghĩa quy trình chuẩn để phát triển, kiểm thử, container hóa và triển khai
InfraRenderAI từ môi trường local đến production.

Mục tiêu cuối cùng:

- Frontend Next.js static export được nginx phục vụ ổn định ở production.
- Backend FastAPI xử lý upload, prompt generation và render.
- OpenAI API key chỉ tồn tại phía server.
- Ứng dụng có Docker, healthcheck, persistent storage và CI/CD.
- Production được phục vụ qua HTTPS.
- Mọi thay đổi quan trọng phải được kiểm chứng bằng test/build trước khi deploy.

---

## 2. Kiến trúc chuẩn hiện tại

```text
Internet
   |
   v
Caddy / HTTPS
   |
   v
Static frontend (nginx)
   |
   | /api/*
   v
FastAPI backend
   |
   v
OpenAI API

Persistent storage:
- uploads
- outputs
```

Frontend self-host gọi same-origin; nginx/Caddy chuyển `/api/*`, `/uploads/*` và
`/outputs/*` tới backend. GitHub Pages dùng `NEXT_PUBLIC_INFRARENDER_API_URL` trỏ
tới backend HTTPS riêng.

Backend không được public trực tiếp ra Internet trong production.

---

## 3. Nguyên tắc bắt buộc

### 3.1 API key

- Không commit API key vào Git.
- Không đưa API key vào frontend.
- Không dùng biến `NEXT_PUBLIC_*` cho API key.
- Production ưu tiên Docker secret hoặc secret manager.
- Backend phải hỗ trợ `OPENAI_API_KEY_FILE`.

### 3.2 Source image

- Hỗ trợ JPG/JPEG, PNG, WEBP.
- Validate file thật bằng Pillow.
- Giới hạn dung lượng.
- Giới hạn pixel.
- Không tin hoàn toàn vào extension hoặc MIME do client gửi.

### 3.3 Render

- Render phải sử dụng ảnh tham chiếu thật.
- Prompt render phải là prompt người dùng đang chỉnh sửa.
- Không tự động tái tạo prompt tại thời điểm render.
- Negative prompt chỉ nối thêm khi người dùng cung cấp.
- Provider errors phải được phân loại rõ.

### 3.4 Production safety

- Backend container chạy non-root khi có thể.
- Không public port backend.
- Dữ liệu upload/output không được phụ thuộc filesystem tạm của container.
- Phải có healthcheck.
- Phải có restart policy.
- Không deploy commit chưa qua CI.

---

## 4. Phase 1 — Backend Core

Yêu cầu:

- FastAPI application.
- CORS.
- `GET /api/health`.
- `GET /api/render-status`.
- `POST /api/render-status/check`.
- `POST /api/upload-image`.
- `POST /api/generate-prompt`.
- `POST /api/render-image`.
- `DELETE /api/files/{directory}/{filename}`.

Backend phải:

- validate ảnh;
- lưu upload;
- tạo prompt rule-based;
- hỗ trợ Vision AI khi có API key;
- render qua provider;
- lưu output;
- trả provider/model metadata;
- xử lý timeout, auth error, rate limit, model error và network error.

Exit criteria:

```text
python -m compileall -q .
python -m unittest discover -s tests -v
```

phải pass.

---

## 5. Phase 2 — Frontend Application

Frontend phải có:

- upload ảnh;
- drag/drop;
- preview;
- zoom/pan/fullscreen;
- ảnh gốc và ảnh render cạnh nhau;
- bảng settings;
- custom keywords;
- notes;
- prompt chính;
- negative prompt;
- prompt history;
- render history;
- favorite prompt;
- export prompt;
- download render result;
- backend/render status.

Frontend phải dùng cùng-origin API:

```text
/api/*
```

Browser gọi trực tiếp `/api/*`; không có Next.js server proxy.

Exit criteria:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

phải pass.

---

## 6. Phase 3 — Frontend Production

Frontend production là static export, build bằng multi-stage Dockerfile và phục vụ
bằng nginx non-root với config do repository quản lý. Self-host dùng same-origin;
nginx/Caddy route tới `backend:8000`. GitHub Pages bắt buộc cấu hình:

```text
NEXT_PUBLIC_INFRARENDER_API_URL=https://backend.example.com
```

Exit criteria:

- Static export build pass.
- Nginx image chạy non-root và healthcheck pass.
- Container frontend khởi động thành công.

---

## 7. Phase 4 — Docker Backend

Backend Dockerfile phải:

- dùng Python 3.11 hoặc version đã được CI xác minh;
- install dependencies từ `requirements.txt`;
- chạy bằng user không phải root khi phù hợp;
- expose 8000;
- chạy Uvicorn;
- tạo `/app/uploads` và `/app/outputs`.

Khuyến nghị command:

```text
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers
```

---

## 8. Phase 5 — Docker Compose

Tối thiểu phải có:

```text
backend
frontend
persistent volumes
healthchecks
restart policy
```

Local:

```text
compose.yaml
compose.local.yaml
```

Production registry deployment (canonical self-host; Caddy + GHCR images):

```text
compose.deploy.yaml
```

CI integration routing test (localhost Caddy, internal CA):

```text
compose.yaml + compose.local.yaml + compose.test.yaml
```

Backend không publish port 8000 trong production.

Frontend không cần public trực tiếp khi có reverse proxy.

---

## 9. Phase 6 — Persistent Storage

Production dùng một named volume thống nhất cho:

```text
/data/projects.sqlite3
/data/uploads
/data/outputs
```

Ví dụ:

```text
infrarender_data
```

Không dùng dữ liệu quan trọng chỉ nằm trong writable layer của container.

Không chạy:

```text
docker compose down -v
```

trên production nếu chưa xác định rõ hậu quả và chưa backup.

---

## 10. Phase 7 — Secrets

Local development có thể dùng:

```text
OPENAI_API_KEY
```

Production ưu tiên:

```text
OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
```

Secret file mặc định:

```text
secrets/openai_api_key.txt
```

Thư mục secrets phải bị Git ignore.

---

## 11. Phase 8 — Reverse Proxy + HTTPS

Production sử dụng Caddy hoặc reverse proxy tương đương.

Caddy là service duy nhất cần public:

```text
80/tcp
443/tcp
443/udp
```

Flow:

```text
domain
  -> Caddy
  -> frontend:3000
  -> backend:8000
```

DNS phải trỏ domain tới VPS.

HTTPS phải được xác minh sau deploy.

---

## 12. Phase 9 — CI

CI bắt buộc kiểm tra:

### Frontend

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

### Backend

```text
pip install -r requirements.txt
python -m compileall -q .
python -m unittest discover -s tests -v
```

### Docker

```text
docker compose config
docker compose build
docker compose up -d
frontend -> /api/health -> backend
docker compose down
```

CI không được cần OpenAI API key thật để pass.

---

## 13. Phase 10 — Container Registry

Sau khi CI pass trên `main`, publish:

```text
ghcr.io/<owner>/infrarender-backend:latest
ghcr.io/<owner>/infrarender-frontend:latest
```

Đồng thời phải publish immutable tag bằng full Git SHA.

Ví dụ:

```text
ghcr.io/<owner>/infrarender-backend:<git-sha>
ghcr.io/<owner>/infrarender-frontend:<git-sha>
```

Production nên hỗ trợ pin image bằng:

```text
INFRARENDER_IMAGE_TAG=<git-sha>
```

để rollback.

---

## 14. Phase 11 — VPS Production Deployment

Server tối thiểu:

- Linux VPS;
- Docker Engine;
- Docker Compose plugin;
- public IP;
- domain;
- firewall;
- đủ disk cho uploads/outputs.

Triển khai bằng GHCR:

```bash
docker compose -f compose.deploy.yaml pull
docker compose -f compose.deploy.yaml up -d
docker compose -f compose.deploy.yaml ps
```

Kiểm tra:

```bash
curl -fsS https://<domain>/api/health
```

Production chỉ được coi là hoàn thành khi:

- HTTPS hoạt động;
- frontend hoạt động;
- frontend proxy tới backend hoạt động;
- upload hoạt động;
- prompt generation hoạt động;
- render thật hoạt động với provider;
- download output hoạt động;
- restart container không làm mất dữ liệu.

---

## 15. Phase 12 — Production Hardening

Bắt buộc xem xét trước khi public rộng rãi:

- firewall;
- rate limiting;
- request size limits;
- log rotation;
- disk usage monitoring;
- backup;
- secret rotation;
- dependency updates;
- image vulnerability scanning;
- retention policy cho uploads/outputs.

---

## 16. Phase 13 — Backup

Backup phải chụp cùng một thời điểm cho:

```text
infrarender_data (projects.sqlite3 + uploads/ + outputs/)

`ops/backup.sh` dừng các container đang ghi volume, tạo archive và checksum;
trap luôn cố khởi động lại writer. `ops/restore.sh` yêu cầu checksum manifest,
chặn volume đang được dùng và xác nhận phá hủy bằng `CONFIRM_RESTORE=yes`.
```

Trước upgrade lớn phải backup hoặc snapshot VPS.

Khuyến nghị production sau này chuyển file lớn sang object storage như S3/R2 nếu cần scale.

---

## 17. Phase 14 — Monitoring

Production mở rộng nên có:

- container uptime monitoring;
- disk alerts;
- HTTP health alerts;
- error logs;
- provider error visibility;
- optional external uptime monitor.

---

## 18. Phase 15 — Scale-up

Chỉ triển khai khi sản phẩm thực sự cần:

- PostgreSQL;
- authentication;
- project database;
- multi-user;
- object storage;
- Redis/job queue;
- render queue;
- quotas;
- billing;
- admin dashboard.

Không đưa Kubernetes vào v1 nếu một VPS + Docker Compose vẫn đáp ứng tải.

---

## 19. Quy tắc thay đổi code

Mọi thay đổi production phải tuân thủ:

```text
edit
  -> typecheck/lint/test
  -> build
  -> Docker integration
  -> CI green
  -> image publish
  -> deploy
  -> smoke test
```

Không bỏ qua test để deploy nhanh.

Không sửa production trực tiếp trong container.

Mọi thay đổi phải quay lại source control.

---

## 20. Definition of Done

InfraRenderAI production được coi là đạt khi:

- code nằm trên GitHub;
- CI xanh;
- frontend build xanh;
- backend tests xanh;
- Docker image build được;
- Docker integration smoke test pass;
- frontend/backend images publish lên registry;
- VPS pull được image;
- HTTPS hoạt động;
- persistent storage hoạt động;
- API key không bị expose;
- healthcheck pass;
- render thật pass;
- backup được thiết lập;
- rollback bằng image SHA được xác minh.

---

## 21. Trạng thái hiện tại

Trạng thái repository hiện tại:

- frontend application: done;
- backend core: done;
- typecheck/lint/tests/build: done;
- Docker frontend/backend: done;
- Docker Compose local: done;
- Docker production/deploy config: done;
- persistent volumes với tên ổn định: done;
- Docker secret support: done;
- Caddy config + request limits + security headers: done;
- API proxy rate limiting: not implemented;
- request tracing an toàn: not implemented;
- Docker log rotation/resource/PID hardening: done;
- upload/output retention: backend lifespan là owner duy nhất, chạy mỗi 24 giờ;
- backup + checksum + restore scripts: done;
- scheduled backup systemd units: done;
- health/disk monitoring systemd units: done;
- deploy health verification: done;
- rollback bằng image SHA: script hỗ trợ pin SHA; production deployment nên dùng SHA;
- dependency pinning/update policy: done;
- Trivy security scan: informational baseline, chưa phải blocking gate cho tới khi
   CRITICAL fixable được xác minh sạch;
- Docker SBOM/provenance: done;
- Docker integration CI: workflow có compose/Caddy/local smoke; production HTTPS,
  backup/restore thật và provider trả phí chưa được chạy trong CI;
- GHCR publish: done;
- guarded GitHub production deploy workflow: done.

Các mục còn lại phụ thuộc hạ tầng bên ngoài repository:

- VPS production thật;
- firewall VPS;
- DNS/domain thật;
- HTTPS certificate được cấp trên domain thật;
- production secrets/SSH credentials;
- cài và bật systemd backup/monitor timers trên VPS;
- off-server backup hoặc VPS snapshot;
- kênh cảnh báo monitoring;
- production render smoke test bằng tài khoản OpenAI thật;
- kiểm thử restore/rollback thực tế trên VPS.

Các hạng mục scale-up như PostgreSQL, authentication, object storage, Redis,
billing và Kubernetes không phải blocker của production v1.

---

## 22. Nguồn sự thật

File này là tài liệu yêu cầu production chuẩn cho InfraRenderAI.

Khi code và tài liệu mâu thuẫn:

1. kiểm tra commit hiện tại;
2. kiểm tra CI;
3. cập nhật Skill nếu kiến trúc thay đổi có chủ đích;
4. không âm thầm đi khác Skill mà không cập nhật tài liệu.

