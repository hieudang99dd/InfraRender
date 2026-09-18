# API InfraRenderAI

Nguồn hợp đồng: `backend/main.py`, `backend/schemas.py`, `backend/services/project_store.py`. Frontend gọi trực tiếp backend; `/api` không phải proxy trên GitHub Pages.

## Xác thực và dữ liệu chung

Khi `INFRARENDER_ACCESS_TOKEN` được cấu hình, các endpoint thao tác bên dưới yêu cầu `Authorization: Bearer <application-access-token>`. Đây là token ứng dụng do chủ máy chủ cấp, không phải OpenAI key. Production yêu cầu token ít nhất 32 ký tự.

Không yêu cầu token: `GET /`, `GET /health`, `GET /api/health`, `GET /api/render-status`, preflight `OPTIONS`, và đọc media tại `/uploads/{filename}`, `/outputs/{filename}`. URL media được đọc công khai bởi người biết URL. API dự án dùng chung cho nhóm tin cậy, chưa có quyền sở hữu theo tài khoản.

Request JSON tối đa 4 MiB. Đường dẫn ảnh nhận tên dạng 32 chữ số hex thường và phần mở rộng `png`, `jpg`, `jpeg`, `webp`; không nhận đường dẫn hay URL tùy ý. URL trả về dùng `INFRARENDER_PUBLIC_BASE_URL` nếu có, nếu không dùng origin của request backend.

Lỗi ứng dụng thường có dạng `{"detail":"Thông báo tiếng Việt"}`. Lỗi kiểm tra schema của FastAPI có thể trả `detail` là danh sách lỗi trường.

| HTTP  | Ý nghĩa                                                               |
| ----- | --------------------------------------------------------------------- |
| `400` | Ảnh hỏng/sai định dạng hoặc provider từ chối nội dung                 |
| `401` | Thiếu hoặc sai mã truy cập ứng dụng                                   |
| `404` | Không có dự án/ảnh hoặc tên file không hợp lệ                         |
| `409` | Revision cũ, ảnh tham chiếu đã mất, hoặc file còn được dự án sử dụng  |
| `413` | Request/ảnh vượt giới hạn                                             |
| `422` | Sai schema, thiết lập, kích thước hoặc snapshot                       |
| `429` | Hai tác vụ AI đang xử lý trong process hoặc provider giới hạn yêu cầu |
| `502` | Provider lỗi, từ chối quyền hoặc trả dữ liệu không hợp lệ             |
| `503` | Chưa cấu hình provider hoặc kho dữ liệu chưa truy cập được            |
| `504` | Provider phản hồi quá thời gian                                       |

## Health và trạng thái provider

`GET /` trả `status`, `service`, `version`.

`GET /health` và `GET /api/health` trả:

```json
{
  "status": "ok",
  "service": "InfraRender AI Backend",
  "version": "0.6.0",
  "authentication_required": true,
  "capabilities": {
    "upload": true,
    "prompt_generation": true,
    "projects": true,
    "image_generation": false
  },
  "renderer": {
    "configured": false,
    "provider": "OpenAI Images",
    "model": "gpt-image-2",
    "ready": false,
    "verification_kind": null,
    "state": "missing_key",
    "message": "Thông báo trạng thái",
    "checked_at": null
  }
}
```

`GET /api/render-status` trả riêng object `renderer`, không gọi provider. `POST /api/render-status/check` kiểm tra `/models/{model}` của provider, cần token ứng dụng nếu được cấu hình, không cần body và không tạo ảnh. Kết quả kiểm tra được trả qua `state`/`message`, kể cả khi HTTP là `200`.

`configured` chỉ phản ánh cấu hình. `connected` là truy cập được model, chưa chứng minh render. `rendered`/`ready=true` là đã tạo ảnh thành công. Trạng thái xác minh có TTL 300 giây trong process. Các trạng thái lỗi gồm `missing_key`, `invalid_config`, `unauthorized`, `model_unavailable`, `rate_limited`, `provider_error`, `timeout`; có cấu hình nhưng chưa xác minh là `unverified`.

## Upload ảnh

`POST /api/upload-image`, `multipart/form-data`, trường `file` bắt buộc.

Cho phép JPG/JPEG, PNG, WEBP; tối đa 20 MiB và 40 triệu điểm ảnh. Nội dung thực, phần mở rộng và MIME phải khớp. Không lưu file trống/hỏng. Thành công `200`:

```json
{
  "status": "success",
  "message": "Tải ảnh lên thành công.",
  "original_name": "hien-trang.jpg",
  "saved_name": "00000000000000000000000000000001.jpg",
  "size_bytes": 102400,
  "size_mb": 0.1,
  "width": 1920,
  "height": 1080,
  "content_type": "image/jpeg",
  "url": "https://backend.example.com/uploads/00000000000000000000000000000001.jpg"
}
```

Các tên trong ví dụ chỉ minh họa; dùng đúng `saved_name` của response thật cho bước tiếp theo.

## Tạo prompt

`POST /api/generate-prompt`, `application/json`, schema `PromptRequest`.

| Trường                                                                                                                  | Kiểu/giới hạn                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mode`                                                                                                                  | `template` mặc định, `refine`, `vision`                                               |
| `reference_image_name`                                                                                                  | Tên ảnh upload; bắt buộc với `vision`                                                 |
| `infrastructure`, `roads`, `buildings`, `vehicles`, `vegetation`, `weather`, `lighting`, `materials`, `camera`, `style` | Chuỗi, mỗi trường tối đa 2.000 ký tự                                                  |
| `buildings_density`, `vehicles_density`, `vegetation_density`                                                           | Chuỗi tối đa 2.000 ký tự hoặc null                                                    |
| `notes`                                                                                                                 | Chuỗi tối đa 5.000 ký tự                                                              |
| `custom_keywords`                                                                                                       | Tối đa 20 chuỗi, mỗi chuỗi 120 ký tự; chuẩn hóa Unicode/khoảng trắng, loại trùng/rỗng |
| `preserve_geometry`, `preserve_road_markings`                                                                           | Boolean hoặc null                                                                     |
| `creativity`                                                                                                            | Số nguyên 0–100 hoặc null                                                             |
| `quality`                                                                                                               | `Original`, `1K`, `2K`, `4K`, `8K`, null hoặc chuỗi rỗng                              |
| `aspect_ratio`                                                                                                          | `Original`, tỷ lệ `W:H`, null hoặc chuỗi rỗng                                         |

```json
{
  "mode": "vision",
  "reference_image_name": "00000000000000000000000000000001.jpg",
  "buildings": "industrial",
  "weather": "sunny weather",
  "custom_keywords": ["đường dành cho xe đạp", "cây bản địa"],
  "notes": "Giữ hướng nhìn và đường hiện hữu.",
  "preserve_geometry": true,
  "quality": "4K",
  "aspect_ratio": "16:9"
}
```

Response `200`:

```json
{
  "status": "success",
  "prompt": "Tạo phối cảnh hạ tầng từ ảnh tham chiếu...",
  "mode": "vision",
  "model": "gpt-4o-mini",
  "analysis": ["Nhận xét về những gì nhìn thấy trong ảnh."]
}
```

`template` không gọi AI, trả `model=null`, `analysis=[]`. `refine` biên tập thiết lập bằng AI, không gửi ảnh. `vision` gửi ảnh đã kiểm tra. Hai chế độ AI trả lỗi rõ nếu chưa có key, không âm thầm chuyển sang template. Prompt/analysis được yêu cầu bằng tiếng Việt; response AI bị kiểm tra schema, giới hạn prompt 28.000 ký tự, tối đa 12 nhận xét, mỗi nhận xét 2.000 ký tự. Timeout 60 giây; không tự retry.

## Render ảnh

`POST /api/render-image`, `application/json`. Không gửi multipart ở bước này: dùng ảnh đã upload.

```json
{
  "prompt": "Tạo phối cảnh hạ tầng từ ảnh tham chiếu...",
  "negative_prompt": "Tránh chữ, watermark và méo hình học.",
  "reference_image_name": "00000000000000000000000000000001.jpg",
  "settings": { "quality": "4K", "aspect_ratio": "16:9", "creativity": 25 },
  "project_name": "Phương án khu công nghiệp"
}
```

`prompt`: 1–28.000 ký tự. `negative_prompt`: tối đa 4.000, mặc định rỗng. Tổng chỉ dẫn ghép tối đa 32.000 ký tự. `settings` là `PromptRequest`, bắt buộc. `project_name` tối đa 200 ký tự, mặc định `Dự án hạ tầng mới`; trường này không tự tạo hoặc lưu dự án.

`quality` quy định cạnh dài đầu ra: `1K=1024`, `2K=2560`, `4K=3840`, `8K=7680` pixel. `Original` giữ cạnh dài ảnh nguồn. Tỷ lệ chấp nhận từ 1:3 đến 3:1; ảnh đầu ra không vượt 40 triệu điểm ảnh. Vì vậy một số cặp như 8K vuông bị từ chối trước khi gọi provider.

Backend gửi `size` thực tới provider. Nếu kích thước ảnh trả về khác mục tiêu, backend cắt giữa và nội suy LANCZOS về kích thước cuối; không kéo méo tỷ lệ. Output là PNG, tối đa 32 MiB. Mức sáng tạo chỉ tác động chỉ dẫn bằng chữ, không phải tham số API riêng. Timeout provider 180 giây; không tự retry.

Response `200`:

```json
{
  "status": "success",
  "url": "https://backend.example.com/outputs/00000000000000000000000000000002.png",
  "name": "00000000000000000000000000000002.png",
  "width": 3840,
  "height": 2160,
  "provider": "OpenAI Images",
  "model": "gpt-image-2",
  "details": {
    "requested_size": "3840x2160",
    "provider_size": "3840x2160",
    "native_size": "3840x2160",
    "final_size": "3840x2160",
    "processing": "native",
    "upscaled": false,
    "cropped": false,
    "experimental": true
  }
}
```

`processing` có thể là `native`, `resized`, `cropped`, `cropped_and_resized`. `experimental` đánh dấu yêu cầu provider vượt ngưỡng kích thước thử nghiệm của planner; không phải cam kết provider chắc chắn hỗ trợ. Luôn đọc metadata thực thay vì suy ra độ chi tiết gốc từ nhãn 4K/8K.

## Dự án

| Method và đường dẫn         | Request / response                                                             |
| --------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/projects`         | Object có mảng `projects`; mỗi entry gồm `id`, `name`, `revision`, `updated_at`; mới nhất trước |
| `POST /api/projects`        | Body `{name,workspace}`; `201` trả document đầy đủ                             |
| `GET /api/projects/{id}`    | `200` trả document đầy đủ                                                      |
| `PUT /api/projects/{id}`    | Body `{name,workspace,revision}`; `200` trả revision mới                       |
| `DELETE /api/projects/{id}` | `{id,deleted_files,failed_files}`                                              |

Document đầy đủ có dạng:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Dự án mới",
  "revision": 1,
  "updated_at": "2026-09-18T00:00:00+00:00",
  "workspace": {
    "schemaVersion": 2,
    "source": null,
    "settings": {},
    "prompt": "",
    "negativePrompt": "",
    "versions": [],
    "renderVersions": [],
    "promptMode": "template"
  }
}
```

Tên dự án có 1–200 ký tự. `PUT` bắt buộc revision nguyên >=1 khớp bản đang lưu, nếu không trả `409`; không tự hợp nhất. Snapshot chỉ nhận các trường gốc: `schemaVersion`, `projectName`, `source`, `settings`, `notes`, `prompt`, `negativePrompt`, `versions`, `activeVersion`, `generatedFrom`, `renderVersions`, `renderHistory`, `activeRenderId`, `promptMode`, `promptAnalysis`, `promptModel`, `renderedImage`. Hai tên lịch sử được chấp nhận để tương thích; client hiện dùng `renderVersions`.

Giới hạn storage: mỗi danh sách lịch sử tối đa 200 entries, snapshot JSON tối đa 4 MiB và có giới hạn độ sâu/số phần tử. Source lưu metadata như `{name,url,saved_name,size,resolution}`; không lưu File, blob URL hay base64 ảnh trong snapshot. `renderVersions[]` tham chiếu output bằng `name`, nguồn bằng `source.saved_name`. `renderHistory[]` tương thích dùng `result.name`. `renderedImage.name` cũng được bảo vệ.

Backend kiểm tra các file tham chiếu còn tồn tại khi tạo/cập nhật, trả `409` nếu thiếu. Xóa dự án chỉ dọn ảnh không còn được dự án khác tham chiếu; xem `failed_files` để biết file chưa xóa được. Bỏ một entry khỏi snapshot chưa tự xóa ngay file; file có thể được xóa riêng hoặc dọn theo retention.

## File và retention

`DELETE /api/files/{directory}/{filename}` với directory `uploads` hoặc `outputs`. Thành công:

```json
{
  "kind": "outputs",
  "name": "00000000000000000000000000000002.png",
  "deleted": true
}
```

File còn được dự án sử dụng trả `409`; cần lưu snapshot bỏ tham chiếu trước. Tên sai/file không có trả `404`.

`GET /api/storage` trả số lượng và byte của media trong `uploads`, `outputs`, cùng `total_bytes`, `projects`, `retention_days`. Tổng byte không bao gồm database.

`POST /api/storage/cleanup`, JSON `{"dry_run":true}` để xem trước; `{"dry_run":false}` để thực hiện. Mặc định `dry_run=true`. Response có `dry_run`, `retention_days`, `candidates`, `deleted_files`, `failed_files`, `reclaimed_bytes`; mỗi file có `kind`, `name`, `bytes` khi biết kích thước.

Chỉ file có tuổi lớn hơn retention và không được bất kỳ dự án nào tham chiếu mới được xét. Tuổi tính theo thời gian sửa file, không phải thời gian kể từ khi bỏ tham chiếu. Retention mặc định 30 ngày, cấu hình 1–3650 ngày. Background sweep chạy mỗi 24 giờ sau khởi động. Dọn dẹp không gọi AI.
