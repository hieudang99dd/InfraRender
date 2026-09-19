/**
 * Export Project — packages a complete InfraRenderAI project into a downloadable ZIP.
 *
 * ZIP structure:
 *   <ProjectName>/
 *   ├── 01_anh_goc/          ← reference image(s)
 *   ├── 02_anh_render/       ← all render outputs
 *   ├── 03_prompt/
 *   │   ├── prompt_hien_tai.txt
 *   │   ├── lich_su_prompt.json
 *   │   └── lich_su_render.json
 *   └── project.json         ← full settings + metadata
 */
import JSZip from "jszip";
import type { WorkspaceState } from "./workspace-state";

export type ExportProgress = {
  stage: "preparing" | "images" | "packing" | "done" | "error";
  current: number;
  total: number;
  message: string;
};

export type ExportOptions = {
  /** Called at each progress update so the caller can show a progress indicator. */
  onProgress?: (p: ExportProgress) => void;
};

/** Sanitise a string so it is safe to use as a filename/folder name. */
function safeName(raw: string, fallback: string): string {
  return (
    raw
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .trim()
      .slice(0, 100) || fallback
  );
}

/** Fetch a URL and return its content as a Blob. Throws with a friendly message on failure. */
async function fetchBlob(url: string): Promise<Blob> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Không tải được ảnh từ máy chủ (${resp.status}): ${url}`);
  return resp.blob();
}

/**
 * Export the entire workspace as a ZIP archive and trigger a browser download.
 *
 * @returns Total number of files written into the ZIP.
 */
export async function exportProjectZip(
  workspace: WorkspaceState,
  options: ExportOptions = {},
): Promise<number> {
  const { onProgress } = options;
  const report = (
    stage: ExportProgress["stage"],
    current: number,
    total: number,
    message: string,
  ) => onProgress?.({ stage, current, total, message });

  const folderName = safeName(workspace.projectName, "InfraRenderAI_Project");
  const zip = new JSZip();
  const root = zip.folder(folderName)!;

  // ------------------------------------------------------------------
  // Count total items so the caller can render a progress bar
  // ------------------------------------------------------------------
  const hasSource = Boolean(workspace.source?.url);
  const renderCount = workspace.renderVersions.length;
  const totalImages = (hasSource ? 1 : 0) + renderCount;
  let done = 0;

  report("preparing", 0, totalImages, "Chuẩn bị xuất dự án…");

  // ------------------------------------------------------------------
  // 01_anh_goc/ — reference image
  // ------------------------------------------------------------------
  if (workspace.source?.url) {
    report("images", done, totalImages, `Tải ảnh gốc: ${workspace.source.name}…`);
    try {
      const blob = await fetchBlob(workspace.source.url);
      const ext = workspace.source.name.split(".").pop() || "png";
      const fname = `reference_${safeName(workspace.source.name, `reference.${ext}`)}`;
      root.folder("01_anh_goc")!.file(fname, blob);
    } catch {
      // Non-fatal: include a placeholder note instead.
      root
        .folder("01_anh_goc")!
        .file(
          "KHONG_TAI_DUOC.txt",
          `Không thể tải ảnh gốc từ máy chủ.\nURL: ${workspace.source.url}\n`,
        );
    }
    done += 1;
    report("images", done, totalImages, "Đã tải ảnh gốc.");
  }

  // ------------------------------------------------------------------
  // 02_anh_render/ — all rendered outputs
  // ------------------------------------------------------------------
  const renderFolder = root.folder("02_anh_render")!;
  for (let i = 0; i < workspace.renderVersions.length; i++) {
    const rv = workspace.renderVersions[i];
    const label = `Render ${String(i + 1).padStart(3, "0")} / ${workspace.renderVersions.length}`;
    report("images", done, totalImages, `${label}: ${rv.name}…`);
    try {
      const blob = await fetchBlob(rv.url);
      const date = rv.createdAt.slice(0, 10);
      const fname = `render_${String(i + 1).padStart(3, "0")}_${date}_${rv.name}`;
      renderFolder.file(fname, blob);
    } catch {
      renderFolder.file(
        `render_${String(i + 1).padStart(3, "0")}_KHONG_TAI_DUOC.txt`,
        `Không thể tải ảnh render từ máy chủ.\nURL: ${rv.url}\n`,
      );
    }
    done += 1;
    report("images", done, totalImages, `${label} xong.`);
  }

  // ------------------------------------------------------------------
  // 03_prompt/ — prompts & history
  // ------------------------------------------------------------------
  const promptFolder = root.folder("03_prompt")!;

  // Current active prompt as a plain text file for quick reading
  if (workspace.prompt.trim()) {
    const sections: string[] = [];
    sections.push(`DỰ ÁN: ${workspace.projectName}`);
    sections.push(`Xuất ngày: ${new Date().toLocaleString("vi-VN")}`);
    sections.push("");
    sections.push("=== PROMPT CHÍNH ===");
    sections.push(workspace.prompt.trim());
    if (workspace.negativePrompt.trim()) {
      sections.push("");
      sections.push("=== NỘI DUNG LOẠI TRỪ ===");
      sections.push(workspace.negativePrompt.trim());
    }
    if (workspace.notes.trim()) {
      sections.push("");
      sections.push("=== GHI CHÚ THIẾT KẾ ===");
      sections.push(workspace.notes.trim());
    }
    promptFolder.file("prompt_hien_tai.txt", sections.join("\n"));
  }

  // Full prompt version history as JSON
  if (workspace.versions.length > 0) {
    promptFolder.file("lich_su_prompt.json", JSON.stringify(workspace.versions, null, 2));
  }

  // Render version metadata (without blobs — images are in 02_anh_render/)
  if (workspace.renderVersions.length > 0) {
    const meta = workspace.renderVersions.map((rv, i) => ({
      index: i + 1,
      name: rv.name,
      createdAt: rv.createdAt,
      width: rv.width,
      height: rv.height,
      provider: rv.provider,
      model: rv.model,
      prompt: rv.prompt,
      negativePrompt: rv.negativePrompt,
      settings: rv.settings,
      notes: rv.notes,
    }));
    promptFolder.file("lich_su_render.json", JSON.stringify(meta, null, 2));
  }

  // ------------------------------------------------------------------
  // project.json — complete project metadata
  // ------------------------------------------------------------------
  const projectMeta = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projectName: workspace.projectName,
    source: workspace.source
      ? {
          name: workspace.source.name,
          size: workspace.source.size,
          resolution: workspace.source.resolution,
        }
      : null,
    settings: workspace.settings,
    notes: workspace.notes,
    summary: {
      promptVersions: workspace.versions.length,
      renders: workspace.renderVersions.length,
    },
  };
  root.file("project.json", JSON.stringify(projectMeta, null, 2));

  // ------------------------------------------------------------------
  // Pack and trigger download
  // ------------------------------------------------------------------
  report("packing", done, totalImages, "Đang nén tệp…");

  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => report("packing", done, totalImages, `Đang nén… ${meta.percent.toFixed(0)}%`),
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${folderName}_${date}.zip`;
  const objUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 2000);

  const fileCount =
    totalImages +
    (workspace.prompt ? 1 : 0) +
    (workspace.versions.length ? 1 : 0) +
    (workspace.renderVersions.length ? 1 : 0) +
    1;
  report("done", fileCount, fileCount, `Đã xuất dự án: ${filename}`);
  return fileCount;
}
