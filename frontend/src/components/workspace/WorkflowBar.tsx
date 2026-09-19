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
  onRefreshEngine
}: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.statusGroup}>
        <div className={`${styles.statusItem} ${hasSource ? styles.ready : ""}`}>
          <div className={styles.dot}></div>
          <span>Ảnh gốc</span>
        </div>
        <div className={`${styles.statusItem} ${isSettingsCustom ? styles.custom : styles.ready}`}>
          <div className={styles.dot}></div>
          <span>Thiết lập: {isSettingsCustom ? "Đã tùy chỉnh" : "Mặc định"}</span>
        </div>
        <div className={`${styles.statusItem} ${hasPrompt ? styles.ready : ""}`}>
          <div className={styles.dot}></div>
          <span>Prompt</span>
        </div>
        <div className={styles.outputSummary}>
          <span className={styles.summaryText}>{outputSummary}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.engineStatus}>
          {renderChecking ? (
            <span className={styles.engineText}><div className={styles.dot} style={{ background: "var(--accent)" }}></div>Đang kiểm tra Render Engine…</span>
          ) : renderConfigured ? (
            <span className={styles.engineText}><div className={styles.dot} style={{ background: "var(--success)" }}></div>Render Engine sẵn sàng</span>
          ) : (
            <span className={styles.engineText} style={{ color: "var(--danger)" }}>
              <AlertTriangle size={13} style={{ marginRight: "4px", verticalAlign: "text-bottom" }} />
              Render Engine chưa kết nối
            </span>
          )}
          {!renderChecking && !renderConfigured && (
             <button className={styles.refreshEngineBtn} onClick={onRefreshEngine} title="Kiểm tra lại">
                <RefreshCw size={13} /> Kiểm tra lại
             </button>
          )}
        </div>

        <button
          className="button button-secondary"
          disabled={!canGenerate || isGenerating || isRendering}
          onClick={onGenerate}
        >
          <Sparkles size={16} />
          <span>{isGenerating ? "Đang xử lý…" : (hasPrompt ? "Cập nhật prompt" : "Tạo prompt")}</span>
        </button>
        
        <button
          className="button button-primary"
          disabled={!canRender || isGenerating || isRendering}
          onClick={onRender}
        >
          <WandSparkles size={16} />
          <span>{isRendering ? "Đang render…" : "Render ảnh"}</span>
        </button>
      </div>
    </div>
  );
}
