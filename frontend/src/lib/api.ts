export function getBackendUrl() {
  const url = process.env.NEXT_PUBLIC_INFRARENDER_API_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  if (typeof window !== "undefined" && !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))
    throw new Error("Chưa cấu hình địa chỉ backend cho website này.");
  return "http://127.0.0.1:8000";
}

let accessToken = "";
export function setAccessToken(token: string) {
  accessToken = token.trim();
  if (typeof window !== "undefined") {
    try { sessionStorage.setItem(`infrarender.access:${getBackendUrl()}`, accessToken); } catch { /* memory still works */ }
    window.dispatchEvent(new Event("infrarender-connection"));
  }
}
export function getAccessToken() {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    try { return sessionStorage.getItem(`infrarender.access:${getBackendUrl()}`) || ""; } catch { return ""; }
  }
  return "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export type PromptMode = "template" | "refine" | "vision";
export type PromptResponse = { prompt: string; mode: PromptMode; model: string | null; analysis: string[] };

export type HealthResponse = {
  status: string;
  renderer?: RenderServiceStatus;
  authentication_required?: boolean;
  capabilities?: { upload: boolean; prompt_generation: boolean; image_generation: boolean };
};

export type UploadResponse = { status: string; original_name: string; saved_name: string; url: string; width: number; height: number; size_mb: number };

export type OutputDetails = { native_size?: string; final_size?: string; provider_size?: string; upscaled?: boolean; cropped?: boolean; processing?: string; experimental?: boolean };

export type RenderResponse = {
  status: "success";
  url: string;
  name: string;
  width: number;
  height: number;
  provider: string;
  model: string;
  details?: OutputDetails;
};

export type RenderServiceStatus = {
  configured: boolean;
  provider: string;
  message: string;
  state?: string;
  checked_at?: string | null;
  ready?: boolean;
  model?: string;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = options.signal ? 30_000 : 10_000,
): Promise<T> {
  if (!path.startsWith("/api/") || path.includes("\\") || path.includes("..")) throw new Error("Đường dẫn API không hợp lệ.");
  const backend = getBackendUrl();
  const token = getAccessToken();
  const headers = token ? new Headers(options.headers) : options.headers;
  if (token) (headers as Headers).set("Authorization", token);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${backend}${path}`, { ...options, headers, signal, cache: "no-store" });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (signal.aborted) {
      throw new Error("Dịch vụ phản hồi quá lâu. Vui lòng kiểm tra trạng thái rồi thử lại.");
    }
    throw new Error("Không thể kết nối dịch vụ. Kiểm tra kết nối rồi thử lại.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      typeof data?.detail === "string" ? data.detail : "Yêu cầu chưa thành công. Vui lòng thử lại.",
      response.status,
    );
  }
  if (!data) throw new Error("Dịch vụ trả về dữ liệu không hợp lệ.");
  return data as T;
}

export function uploadImage(file: File, signal: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<UploadResponse>("/api/upload-image", { method: "POST", body, signal });
}

export function requestRender(
  request: { prompt: string; negative_prompt: string; reference_image_name: string; settings: object; project_name: string },
  signal: AbortSignal,
) {
  return apiRequest<RenderResponse>("/api/render-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  }, 210_000);
}

export function deleteFile(url: string) {
  // Extract directory and filename from url (e.g. /api/files/uploads/abc.png or /uploads/abc.png)
  const match = url.match(/(uploads|outputs)\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/);
  if (!match) return Promise.resolve({ status: "success" }); // Skip if not local
  return apiRequest<{ status: string }>(`/api/files/${match[1]}/${match[2]}`, { method: "DELETE" });
}
