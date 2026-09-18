"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Copy,
  FileText,
  LoaderCircle,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
  RefreshCw,
} from "lucide-react";
import { useRenderService } from "@/hooks/useRenderService";
import type { PromptMode } from "@/lib/api";

type PromptDockProps = {
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  analysis: string[];
  model: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onClear: (mode: "prompt" | "negative") => void;
  onRender: () => void;
  isGenerating: boolean;
  isRendering: boolean;
  canGenerate: boolean;
  isStale: boolean;
  error: string;
  notice: string;
};

export default function PromptDock({
  promptMode, onPromptModeChange, analysis, model,
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  notes,
  onNotesChange,
  onGenerate,
  onSave,
  onClear,
  onRender,
  isGenerating,
  isRendering,
  canGenerate,
  isStale,
  error,
  notice,
}: PromptDockProps) {
  const [mode, setMode] = useState<"prompt" | "negative">("prompt");
  const [copied, setCopied] = useState<{ text: string; mode: "prompt" | "negative" } | null>(null);
  const [copyError, setCopyError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyRequest = useRef(0);
  const currentText = mode === "prompt" ? prompt : negativePrompt;
  const copiedCurrentText = copied?.text === currentText && copied.mode === mode;
  const renderService = useRenderService();

  useEffect(
    () => () => {
      copyRequest.current += 1;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function resetCopyFeedback() {
    copyRequest.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCopied(null);
    setCopyError("");
  }

  async function copy() {
    resetCopyFeedback();
    const request = copyRequest.current;
    try {
      await navigator.clipboard.writeText(currentText);
      if (request !== copyRequest.current) return;
      setCopied({ text: currentText, mode });
      timer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      if (request === copyRequest.current) {
        setCopyError("Chưa thể sao chép tự động. Bạn có thể chọn nội dung và nhấn Ctrl+C.");
      }
    }
  }

  return (
    <section
      className="panel prompt-panel"
      aria-labelledby="prompt-title"
      aria-busy={isGenerating || isRendering}
    >
      <div className="panel-heading">
        <div className="section-title">
          <span className="section-icon">
            <FileText size={17} />
          </span>
          <h2 id="prompt-title">Soạn Chỉ thị Thiết kế (Prompt)</h2>
        </div>
      </div>
      <div className="prompt-content">
        <label className="field-label" htmlFor="prompt-engine">Phương thức Chỉ thị</label>
        <select id="prompt-engine" className="prompt-engine-select" value={promptMode} onChange={e=>onPromptModeChange(e.target.value as PromptMode)} disabled={isGenerating||isRendering}>
          <option value="template">Theo thiết lập — không gọi AI</option>
          <option value="refine">AI tinh chỉnh mô tả</option>
          <option value="vision">AI phân tích ảnh gốc</option>
        </select>
        <p className="engine-help">{promptMode==="template"?"Ghép các lựa chọn thành Chỉ thị tiếng Việt, không phân tích ảnh.":promptMode==="refine"?"AI tối ưu mô tả từ thiết lập. Yêu cầu có thể phát sinh phí API.":"AI đọc ảnh và nhận xét bố cục, kiến trúc, vật liệu, giao thông. Yêu cầu có thể phát sinh phí API."}</p>
        {analysis.length>0 && <details className="prompt-analysis"><summary>Nhận xét từ AI{model?` · ${model}`:""}</summary><ul>{analysis.map((item,index)=><li key={index}>{item}</li>)}</ul></details>}
        <label className="field-label" htmlFor="scene-notes">
          Ghi chú ý tưởng <span>Không bắt buộc</span>
        </label>
        <textarea
          id="scene-notes"
          className="notes-input"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="Ví dụ: giữ nguyên nút giao, thêm cây xanh ở dải phân cách và ánh sáng chiều ấm…"
        />
        <div className="prompt-toolbar">
          <div className="segmented-control" role="group" aria-label="Chọn loại chỉ dẫn">
            <button
              type="button"
              aria-pressed={mode === "prompt"}
              className={mode === "prompt" ? "selected" : ""}
              onClick={() => {
                setMode("prompt");
                resetCopyFeedback();
              }}
            >
              Chỉ thị gốc
            </button>
            <button
              type="button"
              aria-pressed={mode === "negative"}
              className={mode === "negative" ? "selected" : ""}
              onClick={() => {
                setMode("negative");
                resetCopyFeedback();
              }}
            >
              Loại trừ
            </button>
          </div>
          <div className="prompt-tools">
            <button
              type="button"
              className="text-button"
              onClick={copy}
              disabled={!currentText.trim()}
            >
              {copiedCurrentText ? <CheckCheck size={14} /> : <Copy size={14} />}
              {copiedCurrentText ? "Đã sao chép" : "Sao chép"}
            </button>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => {
                onClear(mode);
                resetCopyFeedback();
              }}
              disabled={!currentText && !(mode === "prompt" && isGenerating)}
              aria-label={mode === "prompt" ? "Xóa Chỉ thị chính" : "Xóa nội dung loại trừ"}
            >
              <Trash2 size={14} />
              {mode === "prompt" ? "Xóa Chỉ thị" : "Xóa loại trừ"}
            </button>
          </div>
        </div>
        <label htmlFor="prompt-text" className="sr-only">
          {mode === "prompt" ? "Chỉ dẫn phối cảnh chính" : "Nội dung loại trừ"}
        </label>
        <textarea
          id="prompt-text"
          className="prompt-editor"
          spellCheck={false}
          readOnly={isGenerating || isRendering}
          maxLength={mode === "prompt" ? 28000 : 4000}
          value={currentText}
          onChange={(event) => {
            (mode === "prompt" ? onPromptChange : onNegativePromptChange)(event.target.value);
            resetCopyFeedback();
          }}
          placeholder={
            mode === "prompt"
              ? "Tự soạn hoặc nhấn Tổng hợp Chỉ thị để AI tạo nội dung tự động. Nhấn Kết xuất (Render) khi chỉ dẫn đã phù hợp."
              : "Nhập những chi tiết bạn không muốn xuất hiện trong phối cảnh. Để trống nếu không có yêu cầu loại trừ."
          }
        />
        <div className="editor-meta">
          <span>
            {isRendering
              ? "Tạm khóa khi đang dựng phối cảnh"
              : isGenerating
                ? promptMode === "template" ? "Đang tổng hợp thiết lập…" : "AI đang xử lý yêu cầu…"
                : mode === "prompt"
                  ? "Chỉ dẫn phối cảnh · Có thể chỉnh sửa"
                  : "Những chi tiết cần tránh trong kết quả"}
          </span>
          <span>{currentText.length.toLocaleString("vi-VN")} ký tự</span>
        </div>
        {isStale && (
          <p className="inline-message warning">
            <AlertCircle size={15} />
            Ảnh hoặc thông số đã thay đổi. Bạn có thể chỉnh sửa chỉ dẫn hoặc tạo lại trước khi dựng.
          </p>
        )}
        {(error || copyError) && (
          <p className="inline-message error" role="alert">
            <AlertCircle size={15} />
            {error || copyError}
          </p>
        )}
        {notice && !error && (
          <p className="inline-message success" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        <div className="prompt-actions">
          <p>
            <span className={`status-dot ${canGenerate ? "online" : ""}`} />
            {canGenerate ? "Ảnh tham chiếu đã sẵn sàng" : "Thêm ảnh tham chiếu để bắt đầu"}
          </p>
          <div className="button-group">
            <button
              type="button"
              className="button button-secondary"
              onClick={onSave}
              disabled={!prompt.trim() || isGenerating || isRendering}
              title={!prompt.trim() ? "Cần có chỉ dẫn để lưu phiên bản" : undefined}
            >
              <Save size={14} />
              Lưu phiên bản
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setMode("prompt");
                resetCopyFeedback();
                onGenerate();
              }}
              disabled={!canGenerate || isGenerating || isRendering}
              title={!canGenerate ? "Thêm ảnh tham chiếu để tổng hợp chỉ dẫn" : isRendering ? "Đang trong quá trình kết xuất..." : undefined}
              aria-busy={isGenerating}
            >
              {isGenerating ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
              {isGenerating ? "Đang tổng hợp…" : prompt ? "Cập nhật Chỉ thị" : "Tổng hợp Chỉ thị"}
            </button>
          </div>
        </div>
        <div className="render-action-row">
          <div className="render-service-copy">
            <strong>Kết xuất (Render)</strong>
            <p aria-live="polite">
              {isRendering
                ? "Đang khởi tạo kết xuất (Rendering), vui lòng chờ…"
                : renderService.message}
            </p>
            {!isRendering && (
              <button
                type="button"
                className="text-button"
                disabled={renderService.checking || isGenerating}
                onClick={renderService.refresh}
              >
                <RefreshCw size={12} className={renderService.checking ? "spin" : ""} />
                Kiểm tra lại
              </button>
            )}
          </div>
          <button
            type="button"
            className="button button-primary render-button"
            onClick={onRender}
            disabled={
              !canGenerate ||
              !prompt.trim() ||
              isGenerating ||
              isRendering ||
              !renderService.service?.configured
            }
            title={
              !canGenerate
                ? "Thêm ảnh tham chiếu"
                : !prompt.trim()
                  ? "Cần có chỉ dẫn trước khi dựng phối cảnh"
                  : !renderService.service?.configured
                    ? "Render Engine hiện chưa sẵn sàng"
                    : undefined
            }
            aria-busy={isRendering}
          >
            {isRendering ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={17} />}
            {isRendering ? "Đang kết xuất..." : "Kết xuất (Render)"}
          </button>
        </div>
      </div>
    </section>
  );
}
