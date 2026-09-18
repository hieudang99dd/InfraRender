export type HealthResponse = {
  status: string;
  capabilities?: { upload: boolean; prompt_generation: boolean; image_generation: boolean };
};

export type UploadResponse = { status: string; original_name: string; saved_name: string; url: string };

export type RenderResponse = {
  status: "success";
  url: string;
  name: string;
  width: number;
  height: number;
  provider: string;
  model: string;
};

export type RenderServiceStatus = {
  configured: boolean;
  provider: string;
  message: string;
  state?: string;
  checked_at?: string | null;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = options.signal ? 30_000 : 10_000,
): Promise<T> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, { ...options, signal, cache: "no-store" });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (signal.aborted) {
      throw new Error("Dịch vụ phản hồi quá lâu. Vui lòng kiểm tra trạng thái rồi thử lại.");
    }
    throw new Error("Không thể kết nối dịch vụ. Kiểm tra kết nối rồi thử lại.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string" ? data.detail : "Yêu cầu chưa thành công. Vui lòng thử lại.",
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

export type RenderRequest = {
  prompt: string;
  negative_prompt: string;
  reference_image_name: string;
  settings: Record<string, unknown>;
  project_name: string;
};

export function requestRender(
  request: RenderRequest,
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
