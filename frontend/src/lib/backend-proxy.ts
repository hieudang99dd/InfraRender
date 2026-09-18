type RateRule = { limit: number; windowMs: number };
type RateBucket = { count: number; resetAt: number };

const TEN_MINUTES = 10 * 60 * 1000;
const RATE_RULES: Record<string, RateRule> = {
  "upload-image": { limit: 60, windowMs: TEN_MINUTES },
  "generate-prompt": { limit: 120, windowMs: TEN_MINUTES },
  "render-image": { limit: 12, windowMs: TEN_MINUTES },
  "render-status/check": { limit: 30, windowMs: TEN_MINUTES },
  "files:DELETE": { limit: 120, windowMs: TEN_MINUTES },
};
const rateBuckets = new Map<string, RateBucket>();

function rateLimitKey(request: Request, path: string) {
  const route =
    request.method === "DELETE" && path.startsWith("files/") ? "files:DELETE" : path;
  const forwarded = request.headers.get("x-forwarded-for");
  const client =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return { route, client };
}

export function checkRateLimit(request: Request, path: string) {
  const { route, client } = rateLimitKey(request, path);
  const rule = RATE_RULES[route];
  if (!rule) return null;

  const now = Date.now();
  const key = `${route}:${client}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }
  if (current.count >= rule.limit) {
    return { retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;

  if (rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  return null;
}

export function resetRateLimitsForTests() {
  rateBuckets.clear();
}

// Server-side only: imported by the API route, never by browser components.
const MAX_UPLOAD_REQUEST_BYTES = 21 * 1024 * 1024;
const MAX_JSON_REQUEST_BYTES = 512 * 1024;
const ROUTES: Record<string, string> = {
  health: "GET",
  "render-status": "GET",
  "render-status/check": "POST",
  "generate-prompt": "POST",
  "upload-image": "POST",
  "render-image": "POST",
};
const FILE_PATH = /^(uploads|outputs)\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/;

function responseHeaders(requestId: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-ID", requestId);
  return headers;
}

function failure(detail: string, status: number, requestId: string, extra?: HeadersInit) {
  return Response.json({ detail }, { status, headers: responseHeaders(requestId, extra) });
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

async function readBody(request: Request, signal: AbortSignal, maxBytes: number) {
  signal.throwIfAborted();
  if (Number(request.headers.get("content-length")) > maxBytes) return null;
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
      if (length > maxBytes) {
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
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const path = segments.join("/");
  const file = path.startsWith("files/") ? path.slice(6) : "";
  const isFile = FILE_PATH.test(file);
  const isDeleteFile = isFile && request.method === "DELETE";
  const method = isFile ? (isDeleteFile ? "DELETE" : "GET") : ROUTES[path];
  if (!method) return failure("Không tìm thấy chức năng này.", 404, requestId);
  if (request.method !== method)
    return failure("Phương thức không được hỗ trợ.", 405, requestId);

  const limited = checkRateLimit(request, path);
  if (limited) {
    return failure(
      "Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau.",
      429,
      requestId,
      { "Retry-After": String(limited.retryAfterSeconds) },
    );
  }

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
      requestId,
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
    headers.set("X-Request-ID", requestId);
    const maxBytes = path === "upload-image" ? MAX_UPLOAD_REQUEST_BYTES : MAX_JSON_REQUEST_BYTES;
    const body =
      request.method === "POST" ? await readBody(request, signal, maxBytes) : undefined;
    if (body === null) {
      const detail =
        path === "upload-image"
          ? "Dữ liệu quá lớn. Ảnh tham chiếu không được vượt quá 20 MB."
          : "Dữ liệu yêu cầu quá lớn.";
      return failure(detail, 413, requestId);
    }

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
          "X-Request-ID": requestId,
        },
      });
    }
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return failure(
        "Dịch vụ trả về dữ liệu không hợp lệ. Kiểm tra địa chỉ backend rồi thử lại.",
        502,
        requestId,
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
      headers: responseHeaders(requestId),
    });
  } catch {
    if (signal.aborted)
      return failure(
        "Dịch vụ phản hồi quá lâu hoặc yêu cầu đã bị hủy. Yêu cầu không được tự động gửi lại.",
        504,
        requestId,
      );
    return failure(
      "Chưa kết nối được máy chủ xử lý. Kiểm tra trạng thái dịch vụ rồi thử lại.",
      503,
      requestId,
    );
  }
}
