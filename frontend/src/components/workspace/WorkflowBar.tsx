import styles from "./WorkflowBar.module.css";
import { Sparkles, WandSparkles } from "lucide-react";

type Props = {
  hasSource: boolean;
  hasPrompt: boolean;
  isGenerating: boolean;
  isRendering: boolean;
  canGenerate: boolean;
  canRender: boolean;
  onGenerate: () => void;
  onRender: () => void;
};

export default function WorkflowBar({
  hasSource,
  hasPrompt,
  isGenerating,
  isRendering,
  canGenerate,
  canRender,
  onGenerate,
  onRender
}: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.statusGroup}>
        <div className={`${styles.statusItem} ${hasSource ? styles.ready : ""}`}>
          <div className={styles.dot}></div>
          <span>Ảnh gốc</span>
        </div>
        <div className={`${styles.statusItem} ${styles.ready}`}>
          <div className={styles.dot}></div>
          <span>Thiết lập</span>
        </div>
        <div className={`${styles.statusItem} ${hasPrompt ? styles.ready : ""}`}>
          <div className={styles.dot}></div>
          <span>Prompt</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className="button button-secondary"
          disabled={!canGenerate || isGenerating || isRendering}
          onClick={onGenerate}
        >
          <Sparkles size={16} />
          <span>{isGenerating ? "Đang xử lý…" : "Tạo prompt"}</span>
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
