"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageChangePayload } from "@/components/workspace/ImageCanvas";
import { apiRequest, uploadImage, requestRender, deleteFile, type RenderResponse } from "@/lib/api";
import { DEFAULT_SETTINGS, toPromptRequest, type RenderSettings } from "@/lib/render-settings";
import { downloadPrompt, promptSignature, type PromptVersion, type RenderVersion } from "@/lib/workspace";

export function useWorkspace() {
  const [projectName, setProjectName] = useState("Dự án hạ tầng mới");
  const [projectRevision, setProjectRevision] = useState(0);
  const [source, setSource] = useState<ImageChangePayload | null>(null);
  const [settings, setSettings] = useState<RenderSettings>({ ...DEFAULT_SETTINGS });
  const [notes, setNotes] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [renderVersions, setRenderVersions] = useState<RenderVersion[]>([]);
  const [sourceImageName, setSourceImageName] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only persisted state after mount. */
  useEffect(() => {
    try {
      const savedV1 = localStorage.getItem("infrarender.workspace.v1");
      let data = null;
      if (savedV1) {
        data = JSON.parse(savedV1);
      } else {
        const savedV0 = localStorage.getItem("infraRender_workspace");
        if (savedV0) {
          data = JSON.parse(savedV0);
          localStorage.setItem("infrarender.workspace.v1", savedV0);
        }
      }
      
      if (data) {
        if (data.projectName) setProjectName(data.projectName);
        if (data.settings) setSettings(data.settings);
        if (data.notes) setNotes(data.notes);
        if (data.prompt) setPrompt(data.prompt);
        if (data.negativePrompt) setNegativePrompt(data.negativePrompt);
        if (data.versions) setVersions(data.versions);
        if (data.renderVersions) setRenderVersions(data.renderVersions);
      }
    } catch {}
    setIsLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isLoaded) return;
    const data = {
      version: "v1",
      projectName, settings, notes, prompt, negativePrompt, versions, renderVersions
    };
    localStorage.setItem("infrarender.workspace.v1", JSON.stringify(data));
  }, [isLoaded, projectName, settings, notes, prompt, negativePrompt, versions, renderVersions]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [renderedImage, setRenderedImage] = useState<RenderResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedFrom, setGeneratedFrom] = useState("");
  const generationRef = useRef<AbortController | null>(null);
  const renderRef = useRef<AbortController | null>(null);
  const downloadRef = useRef<AbortController | null>(null);
  const versionCounter = useRef(0);
  const sourceRef = useRef<ImageChangePayload | null>(null);
  const currentSignature = promptSignature(settings, notes, source?.url || null);

  useEffect(
    () => () => {
      generationRef.current?.abort();
      renderRef.current?.abort();
      downloadRef.current?.abort();
      if (sourceRef.current?.url.startsWith("blob:")) URL.revokeObjectURL(sourceRef.current.url);
    },
    [],
  );

  function cancelRequests() {
    generationRef.current?.abort();
    renderRef.current?.abort();
    downloadRef.current?.abort();
    setIsGenerating(false);
    setIsRendering(false);
    setIsDownloading(false);
  }

  function changeSource(next: ImageChangePayload | null) {
    cancelRequests();
    if (sourceRef.current?.url.startsWith("blob:")) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = next;
    setSource(next);
    setSourceImageName(null);
    // A comparison must never pair a new source with the previous source's render.
    setRenderedImage(null);
    setError("");
    setNotice("");
  }

  function addVersion(text: string, signature = generatedFrom || currentSignature) {
    const version: PromptVersion = {
      id: `version-${++versionCounter.current}`,
      createdAt: new Date().toISOString(),
      prompt: text,
      negativePrompt,
      settings: { ...settings },
      notes,
      sourceName: source?.name || "Không có ảnh tham chiếu",
      favorite: false,
      generatedFrom: signature,
    };
    setVersions((current) => [version, ...current].slice(0, 20));
    setActiveVersion(version.id);
  }

  async function generatePrompt() {
    if (
      !source ||
      (renderRef.current && !renderRef.current.signal.aborted) ||
      (generationRef.current && !generationRef.current.signal.aborted)
    )
      return;
    const controller = new AbortController();
    generationRef.current = controller;
    setIsGenerating(true);
    setError("");
    setNotice("");
    try {
      let reference_image_name = sourceImageName;
      if (source?.file && !reference_image_name) {
        setNotice("AI đang phân tích không gian và vật liệu từ ảnh tham chiếu…");
        const uploadRes = await uploadImage(source.file, controller.signal);
        reference_image_name = uploadRes.saved_name;
        setSourceImageName(reference_image_name);
      }
      
      const requestBody = { ...toPromptRequest(settings, notes), reference_image_name };
      const result = await apiRequest<{ prompt: string }>("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }, 60000);
      if (controller.signal.aborted) return;
      if (typeof result.prompt !== "string" || !result.prompt.trim())
        throw new Error("Dịch vụ chưa trả về chỉ dẫn. Vui lòng thử lại.");
      setPrompt(result.prompt);
      setGeneratedFrom(currentSignature);
      addVersion(result.prompt, currentSignature);
      setNotice("Đã tạo chỉ dẫn phối cảnh và lưu vào lịch sử phiên làm việc.");
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Không thể tạo chỉ dẫn phối cảnh.");
    } finally {
      if (generationRef.current === controller) {
        generationRef.current = null;
        setIsGenerating(false);
      }
    }
  }

  async function renderImage() {
    if (
      !source ||
      !prompt.trim() ||
      (generationRef.current && !generationRef.current.signal.aborted) ||
      (renderRef.current && !renderRef.current.signal.aborted)
    )
      return;
    const controller = new AbortController();
    renderRef.current = controller;
    setIsRendering(true);
    setError("");
    setNotice("");
    try {
      let reference_image_name = sourceImageName;
      if (source?.file && !reference_image_name) {
        setNotice("Đang tải ảnh tham chiếu lên hệ thống…");
        const uploadRes = await uploadImage(source.file, controller.signal);
        reference_image_name = uploadRes.saved_name;
        setSourceImageName(reference_image_name);
      }
      
      if (!reference_image_name) {
        throw new Error("Chưa có ảnh tham chiếu trên máy chủ. Vui lòng chọn lại ảnh.");
      }

      const renderRequest = {
        prompt,
        negative_prompt: negativePrompt,
        reference_image_name,
        settings: toPromptRequest(settings, notes),
        project_name: projectName,
      };

      const result = await requestRender(renderRequest, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.url || !result.name || !result.width || !result.height) {
        throw new Error("Dịch vụ chưa trả về phối cảnh hợp lệ. Vui lòng thử lại.");
      }
      setRenderedImage(result);
      const newRender: RenderVersion = {
        id: `render-${Date.now()}`,
        createdAt: new Date().toISOString(),
        url: result.url,
        name: result.name,
        width: result.width,
        height: result.height,
        prompt,
        negativePrompt,
        settings: { ...settings },
        notes,
        projectName,
        provider: result.provider,
        model: result.model,
      };
      setRenderVersions(curr => [newRender, ...curr].slice(0, 20));
      setNotice("Dựng thành công. Phối cảnh đã được lưu vào lịch sử.");
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Không thể dựng phối cảnh.");
    } finally {
      if (renderRef.current === controller) {
        renderRef.current = null;
        setIsRendering(false);
      }
    }
  }

  async function downloadImage() {
    if (!renderedImage || (downloadRef.current && !downloadRef.current.signal.aborted)) return;
    const controller = new AbortController();
    downloadRef.current = controller;
    setIsDownloading(true);
    setError("");
    try {
      const response = await fetch(renderedImage.url, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error("Không thể tải phối cảnh về. Vui lòng thử lại.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = renderedImage.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) setError("Không thể tải phối cảnh về. Kiểm tra kết nối rồi thử lại.");
    } finally {
      if (downloadRef.current === controller) {
        downloadRef.current = null;
        setIsDownloading(false);
      }
    }
  }

  function clearPrompt(mode: "prompt" | "negative") {
    generationRef.current?.abort();
    generationRef.current = null;
    renderRef.current?.abort();
    renderRef.current = null;
    setIsGenerating(false);
    setIsRendering(false);
    if (mode === "prompt") {
      setPrompt("");
      setGeneratedFrom("");
    } else {
      setNegativePrompt("");
    }
    setActiveVersion(null);
    setError("");
    setNotice(mode === "prompt" ? "Đã xóa chỉ dẫn phối cảnh chính." : "Đã xóa nội dung loại trừ.");
  }

  function deleteVersion(id: string) {
    setVersions((current) => current.filter((version) => version.id !== id));
    if (activeVersion === id) setActiveVersion(null);
    setNotice("Đã xóa phiên bản khỏi chỉ dẫn đã lưu.");
  }

  async function deleteRenderVersion(id: string) {
    const target = renderVersions.find(r => r.id === id);
    if (!target) return;
    setRenderVersions(curr => curr.filter(r => r.id !== id));
    setNotice("Đã xóa phối cảnh khỏi lịch sử.");
    if (target.url) {
        deleteFile(target.url).catch(()=>null);
    }
  }

  function restoreRenderVersion(version: RenderVersion) {
    generationRef.current?.abort();
    generationRef.current = null;
    setIsGenerating(false);
    renderRef.current?.abort();
    renderRef.current = null;
    setIsRendering(false);
    setPrompt(version.prompt);
    setNegativePrompt(version.negativePrompt);
    setSettings(version.settings);
    setNotes(version.notes);
    setRenderedImage({
      status: "success",
      url: version.url,
      name: version.name,
      width: version.width,
      height: version.height,
      provider: version.provider,
      model: version.model,
    });
    setError("");
    setNotice("Đã khôi phục thông số và ảnh từ phối cảnh đã dựng.");
  }



  function restoreVersion(version: PromptVersion) {
    generationRef.current?.abort();
    generationRef.current = null;
    setIsGenerating(false);
    renderRef.current?.abort();
    renderRef.current = null;
    setIsRendering(false);
    setPrompt(version.prompt);
    setNegativePrompt(version.negativePrompt);
    setGeneratedFrom(version.generatedFrom);
    setActiveVersion(version.id);
    setError("");
    setNotice(
      `Đã mở chỉ dẫn của ảnh "${version.sourceName}". Các thông số hiện tại được giữ nguyên.`,
    );
  }

  function resetProject() {
    if (
      (source || renderedImage || prompt || negativePrompt || versions.length || notes) &&
      !window.confirm(
        "Bắt đầu dự án mới? Ảnh và toàn bộ lịch sử chỉ dẫn trong phiên này sẽ bị xóa. Hãy xuất chỉ dẫn cần giữ lại trước khi tiếp tục.",
      )
    )
      return;
    changeSource(null);
    setRenderedImage(null);
    setPrompt("");
    setGeneratedFrom("");
    setActiveVersion(null);
    setProjectRevision((current) => current + 1);
    setProjectName("Dự án hạ tầng mới");
    setSettings({ ...DEFAULT_SETTINGS });
    setNotes("");
    setNegativePrompt("");
    setVersions([]);
    setRenderVersions([]);
  }

  return {
    projectName,
    projectRevision,
    setProjectName,
    source,
    changeSource,
    settings,
    setSettings,
    notes,
    setNotes,
    prompt,
    negativePrompt,
    setPrompt: (value: string) => {
      setPrompt(value);
      setActiveVersion(null);
    },
    setNegativePrompt: (value: string) => {
      setNegativePrompt(value);
      setActiveVersion(null);
    },
    versions,
    renderVersions,
    activeVersion,
    isGenerating,
    isRendering,
    isDownloading,
    renderedImage,
    error,
    notice,
    isStale: Boolean(prompt && generatedFrom && generatedFrom !== currentSignature),
    generatePrompt,
    renderImage,
    downloadImage,
    clearPrompt,
    deleteVersion,
    deleteRenderVersion,
    restoreRenderVersion,
    isLoaded,
    removeRenderedImage: () => {
      downloadRef.current?.abort();
      setIsDownloading(false);
      setRenderedImage(null);
      setNotice("Đã xóa ảnh render khỏi không gian làm việc.");
    },
    restoreVersion,
    resetProject,
    saveVersion: () => {
      if (!prompt.trim()) return;
      addVersion(prompt);
      setNotice("Đã lưu phiên bản prompt hiện tại.");
    },
    toggleFavorite: (id: string) =>
      setVersions((current) =>
        current.map((version) =>
          version.id === id ? { ...version, favorite: !version.favorite } : version,
        ),
      ),
    exportPrompt: () => downloadPrompt(projectName, prompt, negativePrompt),
  };
}
