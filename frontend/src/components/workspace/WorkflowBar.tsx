import styles from "./WorkflowBar.module.css";
import { Sparkles, WandSparkles, RefreshCw, AlertTriangle } from "lucide-react";

type Props = {
  hasSource: boolean;
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
  onRefreshEngine
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

  const renderDisabledReason = isRendering ? "Đang render ảnh" : isGenerating ? "Đang xử lý prompt" : !hasSource ? "Thêm ảnh gốc trước" : !hasPrompt ? "Cần có prompt" : !renderConfigured ? "Render Engine chưa cấu hình" : undefined;
  const generateDisabledReason = isGenerating ? "Đang xử lý prompt" : isRendering ? "Đang render ảnh" : !hasSource ? "Thêm ảnh gốc trước" : undefined;

  return (
    <div className={styles.bar}>
      <div className={styles.statusGroup}>
        <div className={`${styles.statusItem} ${hasSource ? styles.success : styles.muted}`}>
          <div className={styles.dot}></div>
          <span>Ảnh gốc</span>
        </div>
        <div className={`${styles.statusItem} ${isSettingsCustom ? styles.custom : styles.muted}`}>
          <div className={styles.dot}></div>
          <span>Thiết lập: {isSettingsCustom ? "Đã tùy chỉnh" : "Mặc định"}</span>
        </div>
        <div className={`${styles.statusItem} ${hasPrompt ? styles.success : styles.muted}`}>
          <div className={styles.dot}></div>
          <span>Prompt</span>
        </div>
        <div className={styles.outputSummary}>
          <span className={styles.summaryText}>{outputSummary}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.engineStatus}>
          <span className={`${styles.engineText} ${engineClass}`}>
            {!renderChecking && !renderReady && !renderConfigured && <AlertTriangle size={13} style={{ marginRight: "4px", verticalAlign: "text-bottom" }} />}
            <div className={styles.dot}></div>
            {engineText}
          </span>
          {!renderChecking && (!renderConfigured || !renderReady) && (
             <button className={styles.refreshEngineBtn} onClick={onRefreshEngine} title="Kiểm tra lại">
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
          <span>{isGenerating ? "Đang xử lý…" : (hasPrompt ? "Cập nhật prompt" : "Tạo prompt")}</span>
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
