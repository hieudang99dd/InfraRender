# InfraRender Studio · Frontend v0.6

Next.js App Router, React và TypeScript. Giao diện tiếng Việt tông cam dùng CSS
tokens chung kết hợp CSS Modules. Frontend là **static export** (không có Next.js
server), gọi FastAPI backend trực tiếp từ trình duyệt.

## Hai kiến trúc triển khai

Frontend code đọc địa chỉ backend qua `getBackendUrl()` trong `src/lib/api.ts`:

| Tình huống                              | Backend URL                                  |
| --------------------------------------- | -------------------------------------------- |
| GitHub Pages (`INFRARENDER_PAGES=true`) | `NEXT_PUBLIC_INFRARENDER_API_URL` (bắt buộc) |
| Dev local (localhost)                   | `http://127.0.0.1:8000` (mặc định)           |
| Docker/Caddy self-host (domain thật)    | `window.location.origin` (same-origin)       |

- **GitHub Pages**: workflow `frontend-pages.yml` build với
  `NEXT_PUBLIC_INFRARENDER_API_URL` trỏ tới backend HTTPS công khai; trình duyệt
  gọi backend trực tiếp.
- **Docker/Caddy self-host**: bundle không chứa URL backend nên `getBackendUrl()`
  trả về origin hiện tại của website. Caddy (và nginx trong stack local) route
  `/api/*`, `/uploads/*`, `/outputs/*` sang backend, phần còn lại là frontend tĩnh.

Không còn proxy Next.js (`src/app/api/[...path]/route.ts`). Không có biến
`INFRARENDER_API_URL` runtime cho static export — mọi giá trị `NEXT_PUBLIC_*` chỉ
được đọc tại lúc build.

## Lệnh phát triển

```powershell
npm.cmd ci
npm.cmd run dev        # http://localhost:3000, backend mặc định 127.0.0.1:8000
npm.cmd test           # Node test runner trên src/lib/*.test.mjs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build      # tạo frontend/out (static export)
npm.cmd run format:check
```

Dùng Node.js 22.18+ để chạy test TypeScript bằng Node test runner.

Dev đầy đủ hai dịch vụ: chạy `.\start.cmd` ở thư mục gốc repo. Biến địa chỉ backend
dùng là `NEXT_PUBLIC_INFRARENDER_API_URL` (đặt trong `frontend/.env.local` nếu chạy
frontend riêng; mặc định `http://127.0.0.1:8000`). Không đặt provider key hoặc mật
khẩu truy cập trong file env frontend.

## Đăng nhập và xác thực

- Màn hình `LoginScreen` gửi `Authorization: Basic base64(user:pass)`.
- Token (header Basic) được lưu trong `sessionStorage` theo backend URL và chỉ được
  coi là hợp lệ sau `GET /api/auth/check` trả `200`.

## Tổ chức code

- `src/app/page.tsx` ghép các vùng giao diện; `globals.css` chứa palette, typography, bố cục và control chung.
- `src/hooks/useWorkspace.ts` điều phối ảnh, settings, prompt, phiên bản, render/tải kết quả, hủy yêu cầu cũ và vòng đời blob URL.
- `src/hooks/useProjectPersistence.ts` quản lý bản nháp localStorage (theo backend URL), danh sách dự án server, autosave và xung đột `revision` (`409`).
- `src/hooks/useRenderService.ts` theo dõi trạng thái renderer và kiểm tra lại cấu hình.
- `src/lib/api.ts` tập trung URL backend, timeout (upload 120s, render 210s), cancellation và thông báo lỗi; chặn absolute API path để token không rò sang host khác.
- `src/lib/render-settings.ts` trạng thái thiết lập mặc định trống + mapping chỉ gửi lựa chọn đã đặt.
- `src/lib/workspace-state.ts` normalize snapshot từ server/localStorage; `renderHistory` cũ được migrate sang `renderVersions`.
- `src/lib/workspace.ts` định nghĩa phiên bản prompt/render, signature thiết lập và xuất prompt.
- `src/lib/export-project.ts` đóng gói dự án thành ZIP (ảnh gốc, ảnh render, prompt, metadata).
- `src/components/` phân chia theo vùng chức năng: layout, workspace, prompt, output, render, ui.

## Dữ liệu và persistence

- Dự án được lưu qua API vào SQLite backend; trình duyệt giữ bản nháp
  `infrarender.workspace.v2:<backend>` để phục hồi thao tác chưa đồng bộ.
- `revision` kiểm tra xung đột: nhận `409` giữ thay đổi cục bộ, người dùng chọn
  "Mở bản máy chủ" hoặc "Lưu thành bản sao" — không tự ghi đè.
- Lịch sử prompt (`versions`) và lịch sử render (`renderVersions`): giới hạn **200**
  entry mỗi loại (do backend kiểm tra; client cũng slice 200).
- Khôi phục một render khôi phục đúng cặp: ảnh gốc, prompt, nội dung loại trừ,
  thiết lập, ghi chú và đặt `activeRenderId` để so sánh đúng nguồn.

## Prompt modes

- `template`: ghép quy tắc từ thiết lập, không gọi AI, không tốn phí.
- `refine`: gọi model văn bản biên tập thiết lập cho nhất quán (cần `OPENAI_PROMPT_MODEL`).
- `vision`: gửi ảnh gốc cùng thiết lập để nhận prompt + nhận xét tiếng Việt (cần model hỗ trợ vision).

Kết quả trả về kèm `mode`, `model` (nếu dùng AI) và `analysis`. Không có fallback
ngầm: chọn `refine`/`vision` mà thiếu key sẽ nhận lỗi `503` rõ ràng.

## Từ khóa tùy chỉnh

Nằm trong **Yêu cầu bổ sung** của panel phải (`RightPanel`). Tối đa **20** từ khóa,
mỗi từ khóa **120** ký tự Unicode, chuẩn hóa khoảng trắng và chống trùng (không phân
biệt hoa thường). Từ khóa được đưa vào prompt khi bấm **Tạo prompt**.

## Render ảnh

- Cần ảnh gốc đã upload, prompt có nội dung và renderer `configured`.
- Yêu cầu gửi prompt hiện tại + ảnh thật; backend không viết lại prompt.
- Kích thước đúng theo lựa chọn (planner backend), metadata hiển thị rõ
  `native_size → final_size`, `upscaled`/`cropped` nếu có.
- Không gọi AI khi chỉ xem/reload; render thật qua provider có thể phát sinh phí.

## Kiểm tra thủ công

Kiểm tra ở các chiều rộng 1440, 1024, 768, 390, 320 px: không tràn ngang, các nút
thao tác được, hai ảnh so sánh rõ ràng. Thử: chọn/thay/xóa ảnh; file hỏng/quá giới
hạn; tạo/sửa/xóa/lưu/khôi phục prompt; lịch sử render; sao chép/xuất ZIP; mất kết
nối API; renderer chưa cấu hình; đổi tên dự án; xung đột lưu.

Các kiểm thử tự động không thay thế kiểm tra trực quan trong trình duyệt.
