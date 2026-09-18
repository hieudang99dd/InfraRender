import { Box, LogOut, FilePlus, Save, Trash2, Archive, ChevronDown } from "lucide-react";
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

        {/* Cá»¥m Chá»n & Äá»•i tÃªn dá»± Ã¡n há»£p nháº¥t (Capsule) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div 
            style={{ 
              display: 'flex', alignItems: 'center', 
              background: 'var(--surface-2)', 
              borderRadius: '8px', 
              border: '1px solid var(--border)',
              transition: 'border-color 0.2s',
              height: '36px'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <input
              style={{ 
                width: '220px', 
                padding: '0 0.75rem', 
                fontSize: '0.9rem', 
                fontWeight: 600,
                color: 'var(--foreground)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                height: '100%'
              }}
              value={w.projectName}
              maxLength={70}
              disabled={busy}
              onChange={(event) => w.setProjectName(event.target.value)}
              onBlur={() => { if (!w.projectName.trim()) w.setProjectName("Dá»± Ã¡n chÆ°a Ä‘áº·t tÃªn"); }}
              placeholder="TÃªn dá»± Ã¡n..."
              title="Báº¥m Ä‘á»ƒ Ä‘á»•i tÃªn dá»± Ã¡n"
            />
            
            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }}></div>
            
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '36px', height: '100%', justifyContent: 'center' }}>
              <select 
                title="Danh sÃ¡ch dá»± Ã¡n Ä‘Ã£ lÆ°u"
                style={{ 
                  appearance: 'none',
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer'
                }}
                value={w.projectId || ""} 
                disabled={busy} 
                onChange={e => { if(e.target.value) void w.switchProject(e.target.value); }}
              >
                {!w.projectId && <option value="">-- Báº£n nhÃ¡p má»›i --</option>}
                {w.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={16} color="var(--muted)" style={{ pointerEvents: 'none' }} />
            </div>
          </div>

          {/* NÃºt xÃ³a lÃ m má», áº©n mÃ¬nh, chá»‰ Ä‘á» lÃªn khi hover */}
          {w.projectId && (
            <button 
              className="button button-text" 
              onClick={() => void w.deleteCurrentProject()} 
              disabled={busy} 
              title="XÃ³a dá»± Ã¡n nÃ y" 
              style={{ 
                padding: '0 6px', 
                color: 'var(--muted)', 
                opacity: 0.5,
                transition: 'all 0.2s',
                height: '36px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.opacity = '0.5'; }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
        {w.saveError && <span className="save-status error" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{w.saveError}</span>}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="save-status" style={{ fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {w.isUploading ? "Äang lÆ°u áº£nhâ€¦" : w.saveState}
          </span>
        </div>

        <button className="button button-secondary" onClick={w.resetProject} disabled={busy} title="LÃ m má»›i khÃ´ng gian lÃ m viá»‡c (Táº¡o má»›i)">
          <FilePlus size={15} /> <span>LÃ m má»›i</span>
        </button>

        <button className="button button-secondary" onClick={() => void w.saveProject()} disabled={busy || w.conflict} title="LÆ°u dá»± Ã¡n hiá»‡n táº¡i">
          <Save size={15} /> <span>LÆ°u</span>
        </button>

        <div className="export-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border)', paddingLeft: '12px', marginLeft: '4px' }}>
          <button
            className="button button-primary"
            disabled={busy || w.isExporting || !hasData}
            onClick={() => void w.exportProject()}
            title="Xuáº¥t thÆ° má»¥c ZIP dá»± Ã¡n"
          >
            <Archive size={15}/> 
            <span>{w.isExporting ? "Äang Ä‘Ã³ng gÃ³iâ€¦" : "Xuáº¥t ZIP"}</span>
          </button>
          {w.isExporting && exportLabel && (
            <span className="export-progress" style={{ fontSize: '0.8rem', color: 'var(--muted)', position: 'absolute', top: '100%', right: '20px', background: 'var(--surface)', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px' }}>{exportLabel}</span>
          )}
        </div>

        <button 
          className="button button-text" 
          onClick={() => { setAccessToken(""); window.location.reload(); }}
          title="ÄÄƒng xuáº¥t"
          style={{ padding: '0 8px' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
