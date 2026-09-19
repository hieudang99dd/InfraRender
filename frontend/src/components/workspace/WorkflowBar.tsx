import styles from "./WorkflowBar.module.css";
import { Sparkles, WandSparkles, RefreshCw, AlertTriangle } from "lucide-react";

type Props = {
  hasSource: boolean;
  isUploading: boolean;
  hasUploadedSource: boolean;
  hasPrompt: boolean;
  isGenerating: boolean;
  isRendering: boolean;
  canGenerate: boolean;
  canRender: boolean;
  onGenerate: () => void;
  onRender: () => void;
  isSettingsCustom: boolean;
  outputSummary: string;
  renderChecking: boolean;
  renderConfigured: boolean;
  renderReady: boolean;
  onRefreshEngine: () => void;
};

export default function WorkflowBar({
  hasSource,
  isUploading,
  hasUploadedSource,
  hasPrompt,
  isGenerating,
  isRendering,
  canGenerate,
  canRender,
  onGenerate,
  onRender,
  isSettingsCustom,
  outputSummary,
  renderChecking,
  renderConfigured,
  renderReady,
  onRefreshEngine,
}: Props) {
  let engineClass = styles.engineUnavailable;
  let engineText = "Render Engine chưa cấu hình";
  if (renderChecking) {
    engineClass = styles.engineChecking;
    engineText = "Đang kiểm tra Render Engine…";
  } else if (renderReady) {
    engineClass = styles.engineReady;
    engineText = "Render Engine sẵn sàng";
  } else if (renderConfigured) {
    engineClass = styles.engineConfigured;
    engineText = "Render Engine đã cấu hình";
  }

  const renderDisabledReason = isRendering
    ? "Đang render ảnh"
    : isGenerating
      ? "Đang xử lý prompt"
      : isUploading
        ? "Đang tải ảnh lên…"
        : !hasSource
          ? "Chưa có ảnh gốc"
          : !hasUploadedSource
            ? "Ảnh chưa tải xong"
            : !hasPrompt
              ? "Chưa có prompt"
              : !renderConfigured
                ? "Render Engine chưa cấu hình"
                : undefined;
  const generateDisabledReason = isGenerating
    ? "Đang xử lý prompt"
    : isRendering
      ? "Đang render ảnh"
      : isUploading
        ? "Đang tải ảnh lên…"
        : !hasSource
          ? "Chưa có ảnh gốc"
          : !hasUploadedSource
            ? "Ảnh chưa tải xong"
            : undefined;

  return (
    <div className={styles.bar}>
      <div className={styles.statusGroup}>
        <div className={`${styles.statusItem} ${hasSource ? styles.success : styles.muted}`}>
          <span className={styles.dot} aria-hidden="true"></span>
          <span>{isUploading ? "Đang tải ảnh lên..." : "Ảnh gốc"}</span>
        </div>
        <div className={`${styles.statusItem} ${isSettingsCustom ? styles.custom : styles.muted}`}>
          <span className={styles.dot} aria-hidden="true"></span>
          <span>Thiết lập: {isSettingsCustom ? "Đã tùy chỉnh" : "Mặc định"}</span>
        </div>
        <div className={`${styles.statusItem} ${hasPrompt ? styles.success : styles.muted}`}>
          <span className={styles.dot} aria-hidden="true"></span>
          <span>Prompt</span>
        </div>
        <div className={styles.outputSummary}>
          <span className={styles.summaryText}>{outputSummary}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.engineStatus}>
          <span className={`${styles.engineText} ${engineClass}`}>
            {!renderChecking && !renderReady && !renderConfigured && (
              <AlertTriangle size={13} className={styles.engineWarningIcon} />
            )}
            <span className={styles.dot} aria-hidden="true"></span>
            {engineText}
          </span>
          {!renderChecking && (!renderConfigured || !renderReady) && (
            <button
              className={styles.refreshEngineBtn}
              onClick={onRefreshEngine}
              title="Kiểm tra lại"
            >
              <RefreshCw size={13} /> Kiểm tra lại
            </button>
          )}
        </div>

        <button
          className="button button-secondary"
          disabled={!canGenerate || isGenerating || isRendering}
          onClick={onGenerate}
          title={generateDisabledReason}
        >
          <Sparkles size={16} />
          <span>{isGenerating ? "Đang xử lý…" : hasPrompt ? "Cập nhật prompt" : "Tạo prompt"}</span>
        </button>

        <button
          className="button button-primary"
          disabled={!canRender || isGenerating || isRendering}
          onClick={onRender}
          title={renderDisabledReason}
        >
          <WandSparkles size={16} />
          <span>{isRendering ? "Đang render…" : "Render ảnh"}</span>
        </button>
      </div>
    </div>
  );
}
