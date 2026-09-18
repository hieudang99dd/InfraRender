import { Box, LogOut, FilePlus, Save, Trash2, Archive } from "lucide-react";
import type { useWorkspace } from "@/hooks/useWorkspace";
import { setAccessToken } from "@/lib/api";

type HeaderProps = {
  workspace: ReturnType<typeof useWorkspace>;
};

export default function Header({ workspace: w }: HeaderProps) {
  const busy = w.isGenerating || w.isRendering || w.isUploading || w.saving || !w.isLoaded;
  const hasData = Boolean(w.source || w.renderVersions.length > 0 || w.prompt.trim());

  // Export progress label helper
  const exportLabel = w.exportProgress
    ? w.exportProgress.stage === "packing"
      ? w.exportProgress.message
      : w.exportProgress.total > 0
        ? `${w.exportProgress.message} (${w.exportProgress.current}/${w.exportProgress.total})`
        : w.exportProgress.message
    : null;

  return (
    <header className="app-header">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
        <a className="brand" href="#workspace" aria-label="InfraRender">
          <span className="brand-mark">
            <Box size={23} strokeWidth={1.6} />
          </span>
          <span className="brand-name">
            InfraRender<span>BY HIEU.DV</span>
          </span>
        </a>

        <div className="unified-project-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            className="input"
            style={{ width: 'auto', minWidth: '150px', padding: '0.4rem 0.5rem', height: '34px', fontSize: '0.85rem' }}
            value={w.projectId || ""} 
            disabled={busy} 
            onChange={e => { if(e.target.value) void w.switchProject(e.target.value); }}
          >
            {!w.projectId && <option value="">Bản nháp mới</option>}
            {w.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              style={{ width: '180px', padding: '0.4rem 0.5rem', height: '34px', fontSize: '0.85rem' }}
              aria-label="Tên dự án"
              value={w.projectName}
              maxLength={70}
              disabled={busy}
              onChange={(event) => w.setProjectName(event.target.value)}
              onBlur={() => {
                if (!w.projectName.trim()) w.setProjectName("Dự án chưa đặt tên");
              }}
              placeholder="Nhập tên..."
            />
          </div>
        </div>
      </div>

      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
        {w.saveError && <span className="save-status error" style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{w.saveError}</span>}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="save-status" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {w.isUploading ? "Đang lưu ảnh…" : w.saveState}
          </span>
        </div>

        <button className="button button-secondary" onClick={w.resetProject} disabled={busy} title="Làm mới không gian làm việc (Tạo mới)">
          <FilePlus size={15} /> <span>Làm mới</span>
        </button>

        <button className="button button-secondary" onClick={() => void w.saveProject()} disabled={busy || w.conflict} title="Lưu dự án hiện tại">
          <Save size={15} /> <span>Lưu</span>
        </button>
        
        {w.projectId && (
          <button className="button button-text danger-text" onClick={() => void w.deleteCurrentProject()} disabled={busy} title="Xóa dự án này" style={{ padding: '0 8px' }}>
            <Trash2 size={15} />
          </button>
        )}

        <div className="export-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border)', paddingLeft: '12px', marginLeft: '4px' }}>
          <button
            className="button button-primary"
            disabled={busy || w.isExporting || !hasData}
            onClick={() => void w.exportProject()}
            title="Xuất thư mục ZIP dự án"
          >
            <Archive size={15}/> 
            <span>{w.isExporting ? "Đang đóng gói…" : "Xuất ZIP"}</span>
          </button>
          {w.isExporting && exportLabel && (
            <span className="export-progress" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', position: 'absolute', top: '100%', right: '20px', background: 'var(--surface)', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{exportLabel}</span>
          )}
        </div>

        <button 
          className="button button-text" 
          onClick={() => { setAccessToken(""); window.location.reload(); }}
          title="Đăng xuất"
          style={{ padding: '0 8px' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
