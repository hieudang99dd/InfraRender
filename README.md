# InfraRender AI Studio · v0.5

Không gian phối cảnh hạ tầng bằng tiếng Việt: chọn ảnh tham chiếu, tự chọn bối cảnh,
biên soạn prompt và render ảnh bằng dịch vụ đã cấu hình. Giao diện tông cam mở thẳng
vào các vùng ảnh, thiết lập, prompt và kết quả, không còn banner đầu trang.

## Chạy dự án

Yêu cầu: Node.js 22.18 trở lên, npm và Python 3.11 trở lên.

Lần đầu, cài các thư viện tại thư mục dự án:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ../frontend
npm.cmd ci
cd ..
```

Sau đó, chỉ cần chạy một lệnh để mở cả backend và frontend:

```powershell
.\start.cmd
```

Mở <http://localhost:3000> khi terminal báo `Ready`. Giữ terminal mở; nhấn `Ctrl+C`
để dừng các tiến trình do lệnh này tạo. Có thể chạy tệp `start.cmd` bằng đường dẫn đầy
đủ từ thư mục khác. Script kiểm tra thư viện, chờ API hoạt động, ghi log vào `.run/`
và giữ nguyên dịch vụ InfraRender đã chạy sẵn. Script không tự cài thư viện hoặc
đóng ứng dụng đang chiếm cổng.

```powershell
# Chỉ kiểm tra môi trường, không mở dịch vụ.
.\start.cmd -Check

# Khởi động, kiểm tra backend và proxy rồi dừng các tiến trình vừa tạo.
.\start.cmd -SmokeTest

# Đổi cổng nếu đang có ứng dụng khác sử dụng.
.\start.cmd -BackendPort 8001 -FrontendPort 3001
```

Trình duyệt gọi `/api` trên cùng địa chỉ với frontend; máy chủ Next.js chuyển tiếp
tới backend. Vì vậy, khi mở frontend từ điện thoại/máy khác trong LAN, API và ảnh
không trỏ về `localhost` của thiết bị đó. Dùng địa chỉ IP của máy chạy dự án, ví dụ
`http://192.168.1.10:3000`, và cho phép cổng frontend trong mạng nội bộ nếu cần.

Để chạy riêng từng dịch vụ, mở hai terminal tại thư mục dự án:

```powershell
# Terminal backend
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# Terminal frontend
cd frontend
npm.cmd run dev
```

Khi chạy riêng frontend, đặt `INFRARENDER_API_URL` trong `frontend/.env.local` nếu
backend dùng địa chỉ khác; xem `.env.example`. Đây là biến chỉ dùng trên máy chủ,
mặc định `http://127.0.0.1:8000`. Khởi động lại frontend sau khi đổi. Tên cũ
`NEXT_PUBLIC_API_URL` chỉ được đọc làm giá trị dự phòng để tương thích cấu hình cũ.
Lệnh `start.cmd` luôn trỏ frontend mới khởi động tới backend cục bộ theo `BackendPort`.
Frontend đã chạy sẵn giữ cấu hình hiện tại; cần dừng và khởi động lại để đổi backend.

Nếu trang vẫn báo mất kết nối, kiểm tra <http://localhost:3000/api/health> và log
`.run/`. Backend có thể hoạt động để tạo prompt ngay cả khi chưa cấu hình dịch vụ
render. Thiếu `OPENAI_API_KEY` là lỗi cấu hình render riêng, không phải mất kết nối
giữa frontend và backend.

## Cấu hình render

Sao chép `backend/.env.example` thành `backend/.env`, đặt `OPENAI_API_KEY`, rồi khởi
động lại backend. Model mặc định là `gpt-image-2`; có thể cấu hình
`OPENAI_IMAGE_MODEL` và `OPENAI_BASE_URL` cho dịch vụ tương thích OpenAI Images.
API key chỉ nằm ở backend, không đưa vào frontend hoặc biến `NEXT_PUBLIC_*`.

Nhấn **Kiểm tra kết nối render** để kiểm tra khả năng truy cập thông tin model qua
provider (`POST /api/render-status/check`). Kiểm tra không tạo ảnh và không gửi ảnh
hoặc prompt. Giao diện phân biệt thiếu cấu hình, chưa kiểm tra, kết nối thành công,
key bị từ chối, model không khả dụng, giới hạn tài khoản và lỗi mạng. Kết quả được
giữ trong bộ nhớ backend tối đa 5 phút; `GET /api/render-status` chỉ đọc trạng thái.
Kiểm tra thành công chưa bảo đảm quyền tạo ảnh hay hạn mức; một số provider không
có API thông tin model vẫn có thể render. Khi thiếu key, xem ảnh và tạo prompt vẫn
hoạt động. Môi trường hiện tại chưa có API key để xác minh render thật.

## Chức năng hiện có

- Xem ảnh JPG, PNG hoặc WEBP; kéo thả, thay/xóa, phóng to và toàn màn hình. Giới hạn 20 MB và 40 MP.
- Lưu ảnh lên máy chủ qua thao tác riêng; chọn ảnh chỉ tạo bản xem trước trên thiết bị.
- Tất cả thiết lập ban đầu để trống. Người dùng chọn độc lập thời tiết, ánh sáng, loại công trình/cây xanh/phương tiện, camera, hình khối và thông số đầu ra; chọn một mục không tự đổi mục khác.
- **Từ khóa tùy chỉnh** trong thiết lập bối cảnh cho phép thêm mô tả tự do bằng Enter hoặc nút **Thêm**, không phụ thuộc danh sách có sẵn. Có thể xóa từng từ khóa; tối đa 20 cụm, mỗi cụm 120 ký tự. Dấu phẩy được giữ nguyên trong cụm; khoảng trắng được chuẩn hóa, cụm trùng bị bỏ qua. Các cụm được đưa vào prompt theo thứ tự thêm khi nhấn **Tạo prompt**. **Xóa thiết lập** xóa cả từ khóa và nội dung đang nhập.
- Mật độ công trình, cây xanh và phương tiện là các lựa chọn riêng, không bắt buộc chọn loại đối tượng trước.
- Prompt được tổng hợp **bằng tiếng Việt** khi nhấn **Tạo prompt**, gồm các lựa chọn có sẵn, từ khóa riêng và ghi chú. Nội dung tự nhập được giữ nguyên. Có thể chỉnh sửa, xóa, sao chép và xuất tệp UTF-8.
- Xem lại, yêu thích, xóa từng phiên bản; giữ tối đa 20 phiên bản trong phiên làm việc. Khôi phục chỉ mở prompt chính và nội dung loại trừ, giữ nguyên ảnh, thiết lập và ghi chú hiện tại.
- **Render ảnh** gửi ảnh tham chiếu thật và đúng prompt đã chỉnh sửa tới dịch vụ cấu hình; chỉ nối thêm nội dung loại trừ nếu được nhập. Backend không tự tạo lại prompt hoặc áp lại thiết lập.
- Xem và tải ảnh render xuống; xóa ảnh kết quả khỏi không gian làm việc khi không cần giữ trên trang.
- Vùng so sánh **Ảnh gốc / Ảnh Render** đặt hai ảnh cạnh nhau, cùng kích thước khung và hiển thị trọn ảnh. Trên điện thoại, hai ảnh xếp dọc. Thay hoặc xóa ảnh gốc sẽ gỡ kết quả cũ khỏi vùng so sánh để tránh đối chiếu nhầm; tệp trên máy chủ vẫn được giữ.
- Bố cục hai cột trên desktop; thiết lập nằm cạnh vùng so sánh và prompt. Trên tablet và điện thoại, các vùng xếp theo thứ tự thao tác.

API tạo prompt tổng hợp văn bản từ các lựa chọn và ghi chú; đây không phải bước
phân tích ảnh bằng mô hình thị giác. Bước render riêng mới gửi ảnh và prompt tới
provider. Thông số độ phân giải/tỷ lệ nếu được chọn được đưa vào prompt, không phải
cam kết kích thước ảnh trả về.

Prompt, lịch sử và trạng thái hiển thị kết quả nằm trong bộ nhớ trang và mất khi tải
lại. Xuất prompt hoặc tải ảnh xuống để giữ nội dung. Ảnh đã lưu nằm trong
`backend/uploads/`, ảnh render nằm trong `backend/outputs/`. Xóa ảnh khỏi giao diện
hoặc tạo dự án mới không xóa các tệp trên máy chủ.

## Cấu trúc

```text
frontend/src/
  app/                  Trang chính, bố cục và design tokens
  components/           Thành phần giao diện theo chức năng
  hooks/useWorkspace.ts Trạng thái dự án và điều phối yêu cầu
  lib/                  API client, thiết lập, phiên bản và kiểm thử
backend/
  main.py               Routes và cấu hình dịch vụ
  schemas.py            Kiểu dữ liệu và validation
  services/             Kiểm tra ảnh, xây dựng prompt và gọi dịch vụ render
  tests/                Kiểm thử API
```

## Kiểm tra

```powershell
cd frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run format:check
npm.cmd run build
```

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Kiểm thử renderer dùng HTTP mock, không gọi API có phí. Chưa kiểm thử render thật
với provider vì chưa có API key; cần key có quyền truy cập model để xác minh toàn bộ
quy trình ngoài môi trường mock.

Xem [hướng dẫn frontend](frontend/README.md) và [hợp đồng API](backend/README.md) để phát triển tiếp.


## Docker local

Yêu cầu: Docker Desktop (Windows/macOS) hoặc Docker Engine + Docker Compose plugin (Linux).

Tạo file cấu hình local từ mẫu:

```powershell
Copy-Item .env.example .env
```

Nếu muốn render thật khi chạy Docker local, điền `OPENAI_API_KEY` trong file `.env`.
Nếu chỉ kiểm tra giao diện, upload và tạo prompt rule-based thì có thể để trống key.

Build và chạy toàn bộ stack:

```powershell
docker compose -f compose.yaml -f compose.local.yaml up -d --build
docker compose -f compose.yaml -f compose.local.yaml ps
```

Mở <http://127.0.0.1:3000>. Backend chỉ tồn tại trong Docker network và không public
cổng 8000 ra máy host. Frontend gọi backend qua `http://backend:8000`.

Xem log:

```powershell
docker compose -f compose.yaml -f compose.local.yaml logs -f
```

Dừng container nhưng giữ ảnh đã upload/render trong Docker volumes:

```powershell
docker compose -f compose.yaml -f compose.local.yaml down
```

Chỉ dùng `down -v` khi thực sự muốn xóa cả volumes ảnh.

## Docker production với HTTPS

Kiến trúc production:

```text
Internet
  -> Caddy :80/:443
  -> Next.js frontend :3000 (internal)
  -> FastAPI backend :8000 (internal)
  -> OpenAI API
```

Caddy là service duy nhất public ra Internet. Backend và frontend không publish cổng
trực tiếp. Upload và output nằm trong named volumes `infrarender_uploads` và
`infrarender_outputs`.

Trên VPS, clone repo rồi tạo file `.env`:

```bash
cp .env.example .env
nano .env
```

Ít nhất đặt:

```dotenv
INFRARENDER_DOMAIN=render.example.com
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_VISION_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

DNS A/AAAA của domain phải trỏ tới VPS và firewall phải cho phép TCP 80/443
(cùng UDP 443 nếu muốn HTTP/3).

Tạo Docker secret cho OpenAI:

```bash
mkdir -p secrets
printf '%s' 'YOUR_OPENAI_API_KEY' > secrets/openai_api_key.txt
chmod 600 secrets/openai_api_key.txt
```

Không commit file này. Git đã ignore mọi file trong `secrets/` ngoại trừ tài liệu.

### Cách A — build trực tiếp trên VPS

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

### Cách B — dùng image đã được CI phát hành lên GHCR

CI xanh trên `main` sẽ kích hoạt workflow **Publish Docker Images** và phát hành:

```text
ghcr.io/hieudang99dd/infrarender-frontend:latest
ghcr.io/hieudang99dd/infrarender-backend:latest
```

Với repository/package private, đăng nhập GHCR trên server bằng token chỉ có quyền
đọc package trước khi pull.

```bash
docker compose -f compose.deploy.yaml pull
docker compose -f compose.deploy.yaml up -d
docker compose -f compose.deploy.yaml ps
```

Có thể khóa deployment vào đúng một commit thay vì `latest`:

```dotenv
INFRARENDER_IMAGE_TAG=<full-git-commit-sha>
```

sau đó chạy lại `pull` và `up -d`. Đây cũng là cách rollback: đổi tag về SHA đã
biết là ổn định rồi chạy lại hai lệnh trên.

Kiểm tra production:

```bash
curl -fsS https://render.example.com/api/health
docker compose -f compose.deploy.yaml logs --tail=200
```

## Dữ liệu và backup

Ảnh tham chiếu và ảnh render không nằm trong filesystem tạm của container; chúng nằm
trong Docker named volumes. Việc recreate hoặc upgrade container không làm mất ảnh.

Trước upgrade lớn, nên backup hai volume hoặc snapshot toàn bộ VPS. Không chạy
`docker compose down -v` trong production nếu chưa có backup.

## CI/CD Docker

Workflow `.github/workflows/ci.yml` kiểm tra:

```text
frontend typecheck
frontend lint
frontend tests
Next.js production build
backend compile
backend tests
Docker Compose validation
Docker image build
Docker integration smoke test
```

Smoke test dựng stack thật rồi gọi `http://127.0.0.1:3000/api/health` qua proxy
Next.js tới FastAPI.

Workflow `.github/workflows/docker-publish.yml` chỉ publish image sau khi workflow
CI của commit `main` hoàn thành thành công. API key OpenAI không được đưa vào image
hoặc GitHub Actions build.
