// Server-side only: imported by the API route, never by browser components.
const MAX_REQUEST_BYTES = 21 * 1024 * 1024;
const ROUTES: Record<string, string> = {
  health: "GET",
  "render-status": "GET",
  "render-status/check": "POST",
  "generate-prompt": "POST",
  "upload-image": "POST",
  "render-image": "POST",
};
const FILE_PATH = /^(uploads|outputs)\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/;

function failure(detail: string, status: number) {
  return Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });
}

export function backendBaseUrl() {
  const value = (
    process.env.INFRARENDER_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  )
    .trim()
    .replace(/\/+$/, "");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid backend URL");
  }
  return value;
}

async function readBody(request: Request, signal: AbortSignal) {
  signal.throwIfAborted();
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  // Cancelling settles a pending read immediately. The source's cancellation
  // callback may itself never resolve, so do not await its cleanup promise.
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function proxyBackend(request: Request, segments: string[]): Promise<Response> {
  const path = segments.join("/");
  const file = path.startsWith("files/") ? path.slice(6) : "";
  const isFile = FILE_PATH.test(file);
  const isDeleteFile = isFile && request.method === "DELETE";
  const method = isFile ? (isDeleteFile ? "DELETE" : "GET") : ROUTES[path];
  if (!method) return failure("Không tìm thấy chức năng này.", 404);
  if (request.method !== method) return failure("Phương thức không được hỗ trợ.", 405);

  let base: string;
  try {
    base = backendBaseUrl();
    if (new URL(base).origin === new URL(request.url).origin) {
      throw new Error("Backend cannot point to frontend");
    }
  } catch {
    return failure(
      "Địa chỉ dịch vụ chưa hợp lệ. Kiểm tra INFRARENDER_API_URL trong frontend/.env.local rồi khởi động lại.",
      503,
    );
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(path === "render-image" ? 200_000 : 30_000),
  ]);
  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const body = request.method === "POST" ? await readBody(request, signal) : undefined;
    if (body === null)
      return failure("Dữ liệu quá lớn. Ảnh tham chiếu không được vượt quá 20 MB.", 413);

    const targetPath = isDeleteFile ? `api/files/${file}` : isFile ? file : `api/${path}`;
    const response = await fetch(`${base}/${targetPath}`, {
      method: request.method,
      headers,
      body,
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (isFile && response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return failure(
        "Dịch vụ trả về dữ liệu không hợp lệ. Kiểm tra địa chỉ backend rồi thử lại.",
        502,
      );
    }
    // Keep stored images reachable from the same origin, including on LAN and HTTPS.
    if (typeof data.url === "string") {
      const pathname = new URL(data.url, `${base}/`).pathname;
      const match = pathname.match(/\/(uploads|outputs)\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/);
      if (match) data.url = `/api/files/${match[1]}/${match[2]}`;
    }
    return Response.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    if (signal.aborted)
      return failure(
        "Dịch vụ phản hồi quá lâu hoặc yêu cầu đã bị hủy. Yêu cầu không được tự động gửi lại.",
        504,
      );
    return failure(
      "Chưa kết nối được máy chủ xử lý. Chạy start.cmd trong thư mục dự án để khởi động dịch vụ, rồi nhấn kiểm tra lại.",
      503,
    );
  }
}
