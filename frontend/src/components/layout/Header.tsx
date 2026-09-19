import { Box, LogOut, FilePlus, Save, Trash2, Archive, ChevronDown, AlertCircle, MoreHorizontal, RefreshCw, Copy, Check } from "lucide-react";
import type { useWorkspace } from "@/hooks/useWorkspace";
import { setAccessToken } from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import styles from "./Header.module.css";

type HeaderProps = {
  workspace: ReturnType<typeof useWorkspace>;
};

export default function Header({ workspace: w }: HeaderProps) {
  const busy = w.isGenerating || w.isRendering || w.isUploading || w.saving || !w.isLoaded;
  const hasData = Boolean(w.source || w.renderVersions.length > 0 || w.prompt.trim());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [localName, setLocalName] = useState(w.projectName);
  const [isEditingName, setIsEditingName] = useState(false);


  const commitName = () => {
    const finalName = localName.trim() || "Dự án chưa đặt tên";
    if (finalName !== w.projectName) {
      w.setProjectName(finalName);
    }
    setIsEditingName(false);
  };

  const exportLabel = w.exportProgress
    ? w.exportProgress.stage === "packing"
      ? w.exportProgress.message
      : w.exportProgress.total > 0
        ? `${w.exportProgress.message} (${w.exportProgress.current}/${w.exportProgress.total})`
        : w.exportProgress.message
    : null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <a className="brand" href="#workspace" aria-label="InfraRender">
          <span className="brand-mark">
            <Box size={23} strokeWidth={1.6} />
          </span>
          <span className="brand-name">
            InfraRender<span>BY HIEU.DV</span>
          </span>
        </a>

        <div className={styles.projectSelector}>
          <div className={styles.projectNameField}>
            <input
              className={styles.projectInput}
              value={isEditingName ? localName : w.projectName}
              maxLength={70}
              disabled={busy}
              onChange={(event) => {
                setIsEditingName(true);
                setLocalName(event.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitName();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  setIsEditingName(false);
                  setLocalName(w.projectName);
                  e.currentTarget.blur();
                }
              }}
              placeholder="Tên dự án..."
              title="Bấm để đổi tên dự án"
            />
            {isEditingName && (
              <button 
                type="button"
                className="icon-button" 
                style={{ marginLeft: '4px', width: '26px', height: '26px', border: 'none', background: 'transparent' }}
                onClick={commitName}
                title="Đồng ý"
              >
                <Check size={16} color="var(--success)" />
              </button>
            )}
          </div>
          
          <div className={styles.divider}></div>
          
          <div className={styles.dropdownWrapper}>
            <select 
              className={styles.dropdownSelect}
              title="Danh sách dự án đã lưu"
              value={w.projectId || ""} 
              disabled={busy} 
              onChange={e => { if(e.target.value) void w.switchProject(e.target.value); }}
            >
              {!w.projectId && <option value="">-- Bản nháp mới --</option>}
              {w.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={16} color="var(--muted)" style={{ pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        {w.saveError && (
          <div title={w.saveError} className={styles.errorPill}>
            <AlertCircle size={15} />
            <span>Lỗi đồng bộ</span>
          </div>
        )}
        
        <span className={styles.saveStatus}>
          {w.isUploading ? "Đang lưu ảnh…" : w.saveState}
        </span>

        <button className="button button-secondary" onClick={w.resetProject} disabled={busy} title="Dự án mới">
          <FilePlus size={15} /> <span>Dự án mới</span>
        </button>

        <button className="button button-secondary" onClick={() => void w.saveProject()} disabled={busy || w.conflict} title="Lưu dự án hiện tại">
          <Save size={15} /> <span>Lưu</span>
        </button>

        <div className={styles.moreMenuWrapper} ref={menuRef}>
          <button 
            className="button button-text" 
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Tùy chọn khác"
          >
            <MoreHorizontal size={18} />
          </button>
          
          {w.isExporting && exportLabel && !menuOpen && (
             <div style={{ position: 'absolute', top: '100%', right: 0, width: 'max-content' }}>
               <div className={styles.exportProgress}>{exportLabel}</div>
             </div>
          )}

          {menuOpen && (
            <div className={styles.menuDropdown} role="menu">
              <button
                className={styles.menuItem}
                role="menuitem"
                disabled={busy || w.isExporting || !hasData}
                onClick={() => { setMenuOpen(false); void w.exportProject(); }}
              >
                <Archive size={15}/> 
                <span>{w.isExporting ? "Đang đóng gói…" : "Xuất dự án ZIP"}</span>
              </button>

              {w.conflict && w.projectId && (
                <>
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    disabled={busy}
                    onClick={() => { setMenuOpen(false); void w.reloadProject(); }}
                  >
                    <RefreshCw size={15} />
                    <span>Mở bản máy chủ</span>
                  </button>
                  <button
                    className={styles.menuItem}
                    role="menuitem"
                    disabled={busy}
                    onClick={() => { setMenuOpen(false); void w.saveCopy(); }}
                  >
                    <Copy size={15} />
                    <span>Lưu thành bản sao</span>
                  </button>
                </>
              )}
              
              <button 
                className={`${styles.menuItem} ${styles.danger}`} 
                role="menuitem"
                disabled={busy || !w.projectId}
                onClick={() => { setMenuOpen(false); void w.deleteCurrentProject(); }}
              >
                <Trash2 size={15} />
                <span>Xóa dự án</span>
              </button>

              <button 
                className={styles.menuItem}
                role="menuitem"
                onClick={() => { setMenuOpen(false); setAccessToken(""); window.location.reload(); }}
              >
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
