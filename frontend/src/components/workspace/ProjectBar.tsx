"use client";
import { useState } from "react";
import { RefreshCw, Save, Trash2 } from "lucide-react";
import { apiRequest, getAccessToken, setAccessToken } from "@/lib/api";
import type { useWorkspace } from "@/hooks/useWorkspace";

type CleanupReport = {candidates:unknown[];deleted_files:unknown[];failed_files:unknown[];reclaimed_bytes:number};
export default function ProjectBar({workspace:w}:{workspace:ReturnType<typeof useWorkspace>}) {
  const [token,setToken]=useState("");
  const [message,setMessage]=useState("");
  const [report,setReport]=useState<CleanupReport|null>(null);
  const [cleaning,setCleaning]=useState(false);
  const busy=w.isGenerating||w.isRendering||w.isUploading||w.saving||!w.isLoaded;
  async function connect() {
    setAccessToken(token||getAccessToken());setToken("");
    try { await apiRequest("/api/projects");setMessage("Mã truy cập hợp lệ. Đã kết nối kho dự án.");void w.refreshProjects();void w.saveProject(); }
    catch(err){setMessage(err instanceof Error?err.message:"Chưa kết nối được.");}
  }
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
    {w.saveError && <p className="inline-message error" role="alert">{w.saveError}</p>}
    {w.conflict && <div className="button-group">
      <button className="button button-secondary" disabled={busy} onClick={w.reloadProject}>Tải bản máy chủ</button>
      <button className="button button-secondary" disabled={busy} onClick={()=>void w.saveCopy()}>Lưu thành bản sao</button>
    </div>}
    <details className="project-management">
      <summary>Kết nối & quản lý dự án</summary>
      <div className="project-management-content">
        <p>Nhập mã truy cập ứng dụng nếu máy chủ yêu cầu. Mã được giữ trong phiên trình duyệt này.</p>
        <form onSubmit={e=>{e.preventDefault();void connect();}} className="project-controls">
          <label className="sr-only" htmlFor="application-access">Mã truy cập ứng dụng</label>
          <input id="application-access" type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" placeholder="Mã truy cập ứng dụng" maxLength={512}/>
          <button type="submit" className="button button-secondary" disabled={busy}>Kết nối</button>
          <button type="button" className="text-button" disabled={busy} onClick={()=>{setAccessToken("");setMessage("Đã xóa mã truy cập khỏi phiên trình duyệt.");}}>Xóa mã</button>
        </form>
        <div className="button-group">
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
