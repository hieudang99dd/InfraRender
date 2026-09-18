# SKILL_InfraRenderAI_Production_Agent

## 1. Mục đích

Skill này định nghĩa quy trình chuẩn để phát triển, kiểm thử, container hóa và triển khai
InfraRenderAI từ môi trường local đến production.

Mục tiêu cuối cùng:

- Frontend Next.js chạy ổn định ở production.
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
Next.js frontend
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

Frontend và backend giao tiếp trong Docker network.

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

Next.js server proxy tới FastAPI.

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

Kiến trúc chuẩn hiện tại là Next.js standalone server.

```ts
const nextConfig = {
  output: "standalone",
};
```

Không dùng Static Export cho production chính nếu ứng dụng còn sử dụng Next.js API proxy.

Frontend container phải dùng multi-stage build.

Production frontend phải gọi backend nội bộ bằng:

```text
INFRARENDER_API_URL=http://backend:8000
```

Không dùng `localhost` để frontend container gọi backend container.

Exit criteria:

- Next.js production build pass.
- Standalone image build pass.
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

Production build-from-source:

```text
compose.yaml
compose.production.yaml
```

Production registry deployment:

```text
compose.deploy.yaml
```

Backend không publish port 8000 trong production.

Frontend không cần public trực tiếp khi có reverse proxy.

---

## 9. Phase 6 — Persistent Storage

Phải dùng named volumes cho:

```text
/app/uploads
/app/outputs
```

Ví dụ:

```text
infrarender_uploads
infrarender_outputs
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

Tối thiểu phải có chiến lược backup cho:

```text
infrarender_uploads
infrarender_outputs
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

Tại thời điểm tài liệu này được đưa vào repo, project đã đạt:

- frontend application: done;
- backend core: done;
- typecheck/lint/tests/build: done;
- Docker frontend/backend: done;
- Docker Compose local: done;
- Docker production config: done;
- persistent volumes: done;
- Docker secret support: done;
- Caddy config: done;
- Docker integration CI: done;
- GHCR publish: done.

Chưa hoàn tất ngoài hạ tầng thực tế:

- VPS production;
- DNS/domain thật;
- HTTPS certificate thật;
- production render smoke test;
- automated backup;
- monitoring;
- rate limiting;
- long-term storage policy.

---

## 22. Nguồn sự thật

File này là tài liệu yêu cầu production chuẩn cho InfraRenderAI.

Khi code và tài liệu mâu thuẫn:

1. kiểm tra commit hiện tại;
2. kiểm tra CI;
3. cập nhật Skill nếu kiến trúc thay đổi có chủ đích;
4. không âm thầm đi khác Skill mà không cập nhật tài liệu.

