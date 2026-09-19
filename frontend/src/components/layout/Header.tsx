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
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
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
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setProjectMenuOpen(false);
      }
    }
    if (menuOpen || projectMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, projectMenuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <a className={styles.brand} href="#workspace" aria-label="InfraRender">
          <span className={styles.brandMark}>
            <Box size={23} strokeWidth={1.6} />
          </span>
          <span className={styles.brandName}>
            InfraRender<span>BY HIEU.DV</span>
          </span>
        </a>

        <div className={styles.projectSelector} ref={projectMenuRef}>
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
              onBlur={() => {
                if (isEditingName) commitName();
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
                className={styles.confirmNameButton} 
                onClick={commitName}
                title="Đồng ý"
                aria-label="Đồng ý đổi tên"
              >
                <Check size={16} />
              </button>
            )}
          </div>
          
          <div className={styles.divider}></div>
          
          <button 
            className={`${styles.projectDropdownButton} ${projectMenuOpen ? styles.menuOpen : ""}`} 
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label="Danh sách dự án"
            title="Danh sách dự án"
          >
            <ChevronDown size={16} className={styles.chevronIcon} />
          </button>

          {projectMenuOpen && (
            <div className={styles.projectDropdown} role="menu">
              {!w.projectId && (
                <button className={styles.menuItem} role="menuitem" disabled>
                  <Check size={14} className={styles.menuCheckVisible} />
                  <span className={styles.projectNameText}>Bản nháp mới</span>
                </button>
              )}
              {w.projects.map(p => {
                const isActive = p.id === w.projectId;
                return (
                  <button 
                    key={p.id} 
                    className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setProjectMenuOpen(false);
                      if (!isActive) void w.switchProject(p.id);
                    }}
                  >
                    <Check size={14} className={isActive ? styles.menuCheckVisible : styles.menuCheckHidden} />
                    <span className={`${styles.projectNameText} ${isActive ? styles.activeProjectName : ""}`}>{p.name}</span>
                  </button>
                );
              })}
              <div className={styles.projectDropdownDivider}></div>
              <button 
                className={styles.menuItem}
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setProjectMenuOpen(false);
                  w.resetProject();
                }}
              >
                <FilePlus size={14} className={styles.menuCheckHidden} />
                <span>+ Dự án mới</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {w.saveError && (
          <button 
            title={w.saveError} 
            className={`${styles.errorPill} ${w.conflict ? styles.clickableErrorPill : styles.staticErrorPill}`}
            onClick={() => setMenuOpen(true)}
          >
            <AlertCircle size={15} />
            <span>{w.conflict ? "Dự án đã thay đổi ở nơi khác" : "Lỗi đồng bộ"}</span>
          </button>
        )}
        
        <span className={styles.saveStatus}>
          {w.isUploading ? "Đang lưu ảnh…" : w.saveState}
        </span>

        {/* manual Save */}
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
             <div className={styles.exportFloatingStatus}>
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
              
              <div className={styles.projectDropdownDivider}></div>

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
