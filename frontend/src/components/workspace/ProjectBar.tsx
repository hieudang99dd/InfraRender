"use client";
import { useState } from "react";
import { Archive, RefreshCw, Save, Trash2 } from "lucide-react";
import { apiRequest, getAccessToken, setAccessToken } from "@/lib/api";
import type { useWorkspace } from "@/hooks/useWorkspace";

type CleanupReport = {candidates:unknown[];deleted_files:unknown[];failed_files:unknown[];reclaimed_bytes:number};

export default function ProjectBar({workspace:w}:{workspace:ReturnType<typeof useWorkspace>}) {
  const [message,setMessage]=useState("");
  const [report,setReport]=useState<CleanupReport|null>(null);
  const [cleaning,setCleaning]=useState(false);
  const busy=w.isGenerating||w.isRendering||w.isUploading||w.saving||!w.isLoaded;
  const hasData=Boolean(w.source||w.renderVersions.length>0||w.prompt.trim());
  async function cleanup(dryRun:boolean) {
    if(!dryRun && !window.confirm("Xóa các tệp quá hạn không còn thuộc dự án nào?"))return;
    setCleaning(true);setMessage("");
    try {
      const result=await apiRequest<CleanupReport>("/api/storage/cleanup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dry_run:dryRun})});
      setReport(dryRun?result:null);
      setMessage(dryRun?`${result.candidates.length} tệp quá hạn có thể dọn.`:`Đã xóa ${result.deleted_files.length} tệp. ${result.failed_files.length} tệp chưa xóa được.`);
    } catch(err){setMessage(err instanceof Error?err.message:"Không thể dọn kho.");}
    finally{setCleaning(false);}
  }

  // Export progress label helper
  const exportLabel = w.exportProgress
    ? w.exportProgress.stage==="packing"
      ? w.exportProgress.message
      : w.exportProgress.total>0
        ? `${w.exportProgress.message} (${w.exportProgress.current}/${w.exportProgress.total})`
        : w.exportProgress.message
    : null;

  return <section className="project-bar" aria-label="Lưu và mở dự án">
    <div className="project-controls">
      <label htmlFor="saved-project">Dự án</label>
      <select id="saved-project" value={w.projectId||""} disabled={busy} onChange={e=>{if(e.target.value)void w.switchProject(e.target.value);}}>
        {!w.projectId && <option value="">Bản nháp mới</option>}
        {w.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="text-button" onClick={()=>void w.refreshProjects()} disabled={busy} aria-label="Làm mới danh sách dự án"><RefreshCw size={14}/></button>
      <button className="button button-secondary" onClick={()=>void w.saveProject()} disabled={busy||w.conflict}><Save size={14}/>Lưu dự án</button>
      <span className="save-status" role="status">{w.isUploading?"Đang lưu ảnh gốc…":w.saveState}</span>
    </div>

    {/* ── Export project button + progress ── */}
    <div className="project-controls export-controls">
      <button
        className="button button-primary"
        disabled={busy||w.isExporting||!hasData}
        onClick={()=>void w.exportProject()}
        title="Xuất toàn bộ ảnh gốc, ảnh render và prompt thành một file ZIP lưu trên máy tính"
      >
        <Archive size={14}/>
        {w.isExporting?"Đang xuất…":"Xuất dự án (ZIP)"}
      </button>
      {w.isExporting && exportLabel && (
        <span className="save-status" role="status" aria-live="polite">{exportLabel}</span>
      )}
      {!hasData && (
        <span className="save-status muted">Thêm ảnh hoặc prompt để xuất dự án</span>
      )}
    </div>

    {w.saveError && <p className="inline-message error" role="alert">{w.saveError}</p>}
    {w.conflict && <div className="button-group">
      <button className="button button-secondary" disabled={busy} onClick={w.reloadProject}>Tải bản máy chủ</button>
      <button className="button button-secondary" disabled={busy} onClick={()=>void w.saveCopy()}>Lưu thành bản sao</button>
    </div>}
    <details className="project-management">
      <summary>Kết nối &amp; quản lý dự án</summary>
      <div className="project-management-content">
        <div className="button-group">
          <button className="text-button" onClick={() => { setAccessToken(""); window.location.reload(); }}>Đăng xuất</button>
          <button className="text-button" disabled={busy||!w.projectId} onClick={w.reloadProject}>Mở lại bản đã lưu</button>
          <button className="text-button" disabled={busy} onClick={()=>void w.saveCopy()}>Lưu bản sao</button>
          <button className="text-button danger-text" disabled={busy||!w.projectId} onClick={()=>void w.deleteCurrentProject()}><Trash2 size={14}/>Xóa dự án</button>
          <button className="text-button" disabled={busy||cleaning} onClick={()=>void cleanup(true)}>Kiểm tra tệp quá hạn</button>
          {Boolean(report?.candidates.length) && <button className="text-button danger-text" disabled={busy||cleaning} onClick={()=>void cleanup(false)}>Dọn {report?.candidates.length} tệp quá hạn</button>}
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  </section>;
}
