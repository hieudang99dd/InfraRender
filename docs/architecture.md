# Kiến trúc InfraRenderAI

## Các thành phần

```text
Trình duyệt: Next.js / React / TypeScript
  ├─ Ảnh gốc, bối cảnh, prompt, kết quả và lịch sử
  └─ API client → getBackendUrl() (NEXT_PUBLIC_INFRARENDER_API_URL | localhost fallback | same-origin)
          ↓ HTTPS + Basic auth (INFRARENDER_AUTH_USER/PASS) khi được yêu cầu
FastAPI: backend/main.py
  ├─ Xác thực, CORS, kiểm tra request
  ├─ project_store.py → SQLite + tham chiếu ảnh
  ├─ image_upload.py → ảnh đã xác minh
  ├─ prompt_engine.py → template / refine / vision
  └─ image_render.py → output_dimensions.py → image provider
          ↓ Khóa chỉ có ở backend
Provider bên ngoài → PNG → outputs → metadata + URL cho trình duyệt
```

Frontend là static export, gọi FastAPI trực tiếp, không phụ thuộc API proxy hay Next.js server trên GitHub Pages. `frontend/next.config.ts` dùng `/InfraRender` khi `INFRARENDER_PAGES=true`. Các giá trị `NEXT_PUBLIC_*` được đóng vào bundle khi build.

`getBackendUrl()` (`src/lib/api.ts`) quyết định backend URL theo ba chế độ:

1. `NEXT_PUBLIC_INFRARENDER_API_URL` được cấu hình (bắt buộc với build Pages) → dùng URL đó.
2. Trình duyệt ở `localhost`/`127.0.0.1` → `http://127.0.0.1:8000` (dev local).
3. Môi trường còn lại (Docker/Caddy self-host) → `window.location.origin` (same-origin).
   Caddy (và nginx trong stack local) route `/api/*`, `/uploads/*`, `/outputs/*` sang backend; phần còn lại là frontend tĩnh.

## Frontend

| Thành phần                                 | Trách nhiệm                                                  |
| ------------------------------------------ | ------------------------------------------------------------ |
| `src/app/page.tsx`                         | Ghép workspace và hành động chính                            |
| `src/components/workspace/ImageCanvas.tsx` | Chọn, kiểm tra sơ bộ, xem và thay ảnh gốc                    |
| `src/components/layout/RightPanel.tsx`     | Thiết lập bối cảnh và từ khóa riêng                          |
| `src/components/prompt/PromptDock.tsx`     | Chỉnh prompt, tạo prompt và render                           |
| `src/components/output/`                   | Kết quả, tải ảnh và lịch sử                                  |
| `src/hooks/useWorkspace.ts`                | Điều phối upload, prompt, render, lưu và khôi phục workspace |
| `src/hooks/useProjectPersistence.ts`        | Bản nháp local, tự động lưu SQLite, chuyển dự án và xung đột revision |
| `src/lib/api.ts`                           | URL backend, xác thực ứng dụng, timeout và lỗi HTTP          |
| `src/lib/workspace.ts`                     | Kiểu dữ liệu snapshot và lịch sử                             |

Ảnh được upload để có `saved_name` bền vững. Blob URL chỉ dùng xem tạm, không phải địa chỉ lưu lâu dài. Dự án được lưu qua API vào SQLite; browser giữ bản nháp để phục hồi thao tác chưa đồng bộ. `revision` của máy chủ kiểm tra xung đột. Khi nhận `409`, client giữ thay đổi cục bộ; người dùng có thể mở bản mới nhất hoặc lưu thành bản sao, không tự ghi đè.

Token ứng dụng được giữ trong phiên trình duyệt theo backend URL, không phải provider key. Bản nháp local cũng được tách theo backend URL. Tự động lưu không gọi AI.

Lịch sử render lưu ảnh kết quả, prompt, thiết lập, thời điểm và ảnh gốc tương ứng. Khôi phục render cần khôi phục đúng cặp ảnh. Lịch sử prompt là tập riêng để lưu các bản biên tập chỉ dẫn.

## Backend và provider

`schemas.py` kiểm tra API. `image_upload.py` đọc tối đa 20 MiB, xác minh nội dung bằng Pillow và giới hạn 40 triệu điểm ảnh. Tên file máy chủ là UUID; client không được truyền đường dẫn tùy ý.

`prompt_engine.py` cung cấp ba chế độ:

- `template`: biên soạn theo quy tắc trong `prompt_builder.py`, không gọi AI.
- `refine`: gọi model văn bản để diễn đạt thiết lập nhất quán, không gửi ảnh hay tuyên bố đã nhìn ảnh.
- `vision`: gửi ảnh đã upload cùng thiết lập để nhận prompt và nhận xét tiếng Việt. Nhận xét vật liệu/chức năng không rõ được yêu cầu nêu mức độ không chắc chắn.

AI prompt trả JSON có `prompt` và `analysis`, được kiểm tra trước khi đưa tới frontend. Mỗi hành động gửi một yêu cầu provider, không tự retry. Prompt có timeout 60 giây; render có timeout 180 giây. Backend giới hạn hai tác vụ AI đang xử lý trong mỗi process.

`image_render.py` lập kế hoạch đầu ra và gọi `providers/openai_provider.py`. Adapter dùng `/images/edits`, gửi ảnh gốc, prompt và tham số `size` thực. `output_dimensions.py` chọn kích thước provider, rồi dùng Pillow cắt giữa/nội suy khi cần. Response ghi `native_size`, `final_size`, `processing`, `upscaled`, `cropped`; nội suy không được mô tả là độ chi tiết AI gốc. Mức sáng tạo và bảo toàn hình học là hướng dẫn bằng prompt, không bảo đảm kỹ thuật tuyệt đối.

## Lưu trữ và dọn dẹp

`project_store.py` lưu snapshot JSON trong SQLite với khóa ghi khi thay đổi dự án hoặc xử lý tham chiếu ảnh. Mặc định:

```text
backend/
  projects.sqlite3
  uploads/
  outputs/
```

`INFRARENDER_DATA_DIR` thay thế thư mục gốc. Database và ảnh phải được sao lưu/khôi phục cùng nhau. Production dùng một volume bền vững; cấu hình hiện tại hướng tới một instance, không phải nhiều máy chủ có filesystem độc lập.

Khi lưu, backend kiểm tra ảnh được tham chiếu còn tồn tại. Khi xóa file, backend từ chối nếu một dự án vẫn sử dụng ảnh. Xóa dự án chỉ dọn ảnh nếu không còn dự án khác tham chiếu. Retention mặc định 30 ngày (`INFRARENDER_RETENTION_DAYS`, 1–3650) xét theo tuổi file, chỉ áp dụng ảnh không được tham chiếu; **backend là owner duy nhất** — tác vụ chạy mỗi 24 giờ sau khởi động (`main.lifespan`), không có maintenance container riêng. API hỗ trợ xem trước và thực hiện dọn dẹp. `services/cleanup_storage.py` chỉ là CLI thao tác thủ công/ops.

## Ranh giới bảo mật và trạng thái

Provider key chỉ có ở backend. `INFRARENDER_AUTH_PASS` bảo vệ API thao tác bằng Basic auth; production yêu cầu password ít nhất 12 ký tự, public URL HTTPS và CORS cụ thể. Đây là khóa cho nhóm dùng chung, chưa có phân quyền theo người dùng (ngoài `INFRARENDER_AUTH_USER`).

Health và trạng thái cấu hình được đọc công khai. `/uploads/...` và `/outputs/...` cũng là URL công khai có tên khó đoán; người biết URL có thể đọc ảnh. Không dùng bản triển khai này để cung cấp kho ảnh riêng tư theo tài khoản.

**Roadmap (chưa cần cho v1 theo phạm vi hiện tại):** nếu triển khai chứa ảnh khách hàng/dự án nhạy cảm, migrate sang authenticated media endpoint (qua middleware) hoặc signed URLs (vd S3/R2 presigned) thay vì capability URLs. Không gọi UUID filename là ranh giới bảo mật tuyệt đối.

`configured` cho biết cấu hình hợp lệ. `connected` cho biết kiểm tra quyền truy cập model thành công. `rendered` mới ghi nhận tạo ảnh thành công; xác minh được giữ trong process khoảng năm phút. Khởi động lại backend không giữ trạng thái xác minh.
