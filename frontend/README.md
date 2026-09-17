# InfraRender Studio · Frontend v0.5

Next.js App Router, React và TypeScript. Giao diện tiếng Việt tông cam sử dụng CSS
tokens chung kết hợp CSS Modules. Trang mở trực tiếp vào không gian làm việc,
không có banner lớn phía trên.

## Lệnh phát triển

Từ thư mục gốc, chạy `.\start.cmd` để mở backend và frontend cùng lúc; chờ thông
báo `Ready` rồi mở <http://localhost:3000>. `Ctrl+C` dừng các dịch vụ do script tạo.
Xem [hướng dẫn chung](../README.md) để cài thư viện, đổi cổng hoặc kiểm tra log.

Nếu muốn chạy frontend riêng, thực hiện trong thư mục `frontend`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Mặc định: <http://localhost:3000>. Dùng Node.js 22.18 trở lên để chạy cả kiểm thử TypeScript bằng Node test runner.

| Lệnh                       | Mục đích                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `npm.cmd run lint`         | ESLint, React hooks và Next.js                                  |
| `npm.cmd run typecheck`    | Kiểm tra kiểu dữ liệu                                           |
| `npm.cmd test`             | Kiểm thử thiết lập bối cảnh, trạng thái phiên bản và API client |
| `npm.cmd run format`       | Định dạng code bằng Prettier                                    |
| `npm.cmd run format:check` | Kiểm tra định dạng                                              |
| `npm.cmd run build`        | Build production                                                |
| `npm.cmd start`            | Chạy bản production sau khi build                               |

Đặt `INFRARENDER_API_URL` trong `.env.local` nếu backend dùng địa chỉ khác. Mặc định
là `http://127.0.0.1:8000`; cần khởi động lại dev server sau khi thay đổi. Biến này
chỉ được dùng trên máy chủ Next.js. Tên cũ `NEXT_PUBLIC_API_URL` được đọc làm giá
trị dự phòng nếu chưa đặt biến mới.

Trình duyệt gọi API và tải ảnh qua proxy cùng origin với frontend. Khi truy cập
từ điện thoại hoặc máy khác, chỉ cần địa chỉ frontend truy cập được; backend có
thể tiếp tục lắng nghe tại `127.0.0.1`. `start.cmd` cấu hình địa chỉ backend cục bộ
cho frontend mới tạo. Dùng HTTPS ngoài môi trường localhost để chức năng clipboard
hoạt động đầy đủ.

## Tổ chức code

- `src/app/page.tsx` ghép các vùng giao diện; `globals.css` chứa palette, typography, bố cục responsive và các control chung.
- `src/hooks/useWorkspace.ts` quản lý ảnh, prompt, thiết lập, phiên bản, render/tải kết quả, hủy yêu cầu cũ và vòng đời blob URL.
- `src/hooks/useRenderService.ts` kiểm tra trạng thái cấu hình renderer và cho phép kiểm tra lại.
- `src/lib/render-settings.ts` định nghĩa trạng thái ban đầu trống và mapping chỉ gửi các lựa chọn đã được đặt. Các thiết lập độc lập, không tự đồng bộ thời tiết với ánh sáng.
- `src/lib/api.ts` tập trung URL dịch vụ, timeout, cancellation và thông báo lỗi.
- `src/app/api/[...path]/route.ts` chuyển tiếp API và ảnh qua cùng origin; địa chỉ backend chỉ được đọc trên máy chủ.
- `src/lib/workspace.ts` định nghĩa phiên bản, dấu vết thiết lập để nhận biết prompt cũ và xuất tệp.
- `src/components/` phân chia theo vùng chức năng: layout, workspace, prompt, output, render, ui.

Các nút có trạng thái disabled/loading thật, control có nhãn truy cập và focus bàn phím. Ảnh người dùng dùng `next/image` với `unoptimized` vì đây là blob cục bộ.

## Phạm vi chức năng

Ảnh chọn từ thiết bị được xem trước cục bộ. **Lưu ảnh lên máy chủ** lưu bản nguồn;
**Render ảnh** gửi trực tiếp ảnh nguồn và nội dung prompt tới backend, không cần
lưu bản nguồn trước. Hỗ trợ JPG, PNG và WEBP, tối đa 20 MB và 40 MP.

Tất cả thiết lập, prompt và nội dung loại trừ ban đầu để trống. Chọn một thiết lập
chỉ đổi đúng mục đó. Loại công trình/cây xanh/phương tiện và mật độ tương ứng được
chọn riêng. Có thể bỏ chọn một mục; không tự áp bối cảnh hoặc sinh prompt khi đổi
thiết lập.

**Từ khóa tùy chỉnh** nằm đầu phần thiết lập bối cảnh. Nhập một cụm tự do rồi nhấn
Enter hoặc **Thêm** để lưu; dấu phẩy vẫn thuộc cụm đó. Hỗ trợ tối đa 20 cụm, mỗi
cụm 120 ký tự Unicode, không phân biệt hoa thường khi kiểm tra trùng. Khoảng trắng
được chuẩn hóa và thứ tự thêm được giữ nguyên. Có thể xóa từng thẻ hoặc dùng
**Xóa thiết lập** để xóa toàn bộ cùng nội dung đang nhập. Các từ khóa được đưa vào
prompt khi nhấn **Tạo prompt**, không tự đổi lựa chọn khác và không được lưu sau
khi tải lại trang.

**Tạo prompt** tổng hợp các lựa chọn và ghi chú bằng tiếng Việt khi được nhấn. Các
lựa chọn có sẵn được diễn đạt bằng tiếng Việt; từ khóa và ghi chú tự nhập giữ nguyên.
API này không phân
tích ảnh bằng mô hình thị giác. Người dùng cũng có thể tự viết, chỉnh sửa hoặc xóa
riêng prompt chính/nội dung loại trừ; bản xuất UTF-8 chứa cả hai phần.

Lịch sử tối đa 20 phiên bản chỉ tồn tại trong phiên trang hiện tại, hỗ trợ yêu thích
và xóa từng mục. Khôi phục phiên bản chỉ phục hồi prompt chính và nội dung loại trừ;
ảnh, thiết lập và ghi chú hiện tại được giữ nguyên. Nếu nguồn tạo prompt khác bối
cảnh hiện tại, giao diện nhắc người dùng tự sửa hoặc chủ động tạo lại.

## Render ảnh

Đặt `OPENAI_API_KEY` trong **`backend/.env`**, theo `backend/.env.example`, rồi khởi
động lại backend. Mặc định dùng OpenAI Images với model `gpt-image-2`; model và API
base URL có thể cấu hình ở backend. Frontend không nhận hoặc lưu API key.
`GET /api/render-status` đọc cấu hình và kết quả kiểm tra gần nhất mà không gọi
provider. Nút **Kiểm tra kết nối render** gọi `POST /api/render-status/check` để
kiểm tra quyền truy cập thông tin model, không tạo ảnh hoặc gửi ảnh/prompt.
Trạng thái thể hiện rõ thiếu key, chưa kiểm tra, kết nối thành công, key bị từ
chối, model không khả dụng, giới hạn tài khoản hoặc lỗi mạng. Kết quả có thời hạn
5 phút; nút kiểm tra luôn yêu cầu kiểm tra lại. `configured` chỉ cho biết cấu hình
hợp lệ cục bộ. Kiểm tra thành công chưa bảo đảm quyền tạo ảnh/hạn mức, và provider
không hỗ trợ endpoint thông tin model vẫn có thể render.

**Render ảnh** yêu cầu ảnh nguồn, prompt có nội dung và renderer đã cấu hình. Yêu
cầu gửi đúng prompt đang hiển thị cùng ảnh thật; backend chỉ nối nội dung loại trừ
đã nhập, không áp lại thiết lập hay viết lại prompt. Độ phân giải/tỷ lệ được diễn
đạt trong prompt nếu người dùng chọn; kích thước thực tế phụ thuộc provider.

Vùng **Ảnh gốc / Ảnh Render** hiển thị cạnh nhau trên màn hình lớn và xếp dọc trên
điện thoại. Hai khung ảnh có cùng chiều cao, hiển thị toàn bộ ảnh với khoảng đệm nhỏ.
Thay hoặc xóa ảnh gốc gỡ kết quả cũ khỏi vùng so sánh để tránh đối chiếu sai nguồn.

Kết quả có thể xem, tải xuống hoặc xóa khỏi không gian làm việc. Thao tác xóa trên
trang không xóa tệp `backend/outputs/`; tương tự, xóa ảnh nguồn không xóa bản đã lưu
ở `backend/uploads/`. Trạng thái trang không được khôi phục sau khi tải lại.

Kiểm thử backend dùng HTTP mock và không phát sinh phí render. Chưa có API key để
kiểm thử provider thật. Xem [hướng dẫn backend](../backend/README.md) về cấu hình,
giới hạn và lỗi dịch vụ.

## Kiểm tra giao diện thủ công

Kiểm tra ở các chiều rộng 1440, 1024, 768, 390 và 320 px: không tràn ngang, các nút
vẫn thao tác được, hai ảnh so sánh rõ ràng và thiết lập/prompt dễ tìm. Thử chọn/thay/xóa
ảnh; file hỏng/quá giới hạn; chọn và bỏ chọn từng bối cảnh/mật độ; xác nhận prompt
không tự thay đổi; tạo, sửa, xóa, lưu và khôi phục prompt; xóa lịch sử; sao chép/xuất;
renderer chưa cấu hình; mất kết nối API; tạo dự án mới khi đang đọc ảnh. Với provider
đã cấu hình, kiểm tra render bằng prompt tự sửa, tải kết quả và xóa kết quả khỏi trang.

Các kiểm thử tự động không thay thế kiểm tra trực quan bằng trình duyệt.
