"use client";
import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, FileText, History, Star, Trash2, Check } from "lucide-react";
import type { PromptVersion, RenderVersion } from "@/lib/workspace";

type Props = {
  versions:PromptVersion[]; renderVersions:RenderVersion[]; activeVersion:string|null; activeRenderId:string|null;
  onRestore:(v:PromptVersion)=>void; onToggleFavorite:(id:string)=>void; onDelete:(id:string)=>void;
  onDeleteRender:(id:string)=>void; onRestoreRender:(v:RenderVersion)=>void; onDownloadRender:(v:RenderVersion)=>void;
};
const time=(value:string)=>Number.isNaN(Date.parse(value))?"Không rõ thời gian":new Date(value).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
export default function OutputHistory({versions,renderVersions,activeVersion,activeRenderId,onRestore,onToggleFavorite,onDelete,onDeleteRender,onRestoreRender,onDownloadRender}:Props) {
  const [tab,setTab]=useState<"render"|"prompt">("render");
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const prompts=favoritesOnly?versions.filter(v=>v.favorite):versions;
  return <section className="panel history-panel" aria-labelledby="history-title">
    <div className="panel-heading history-heading">
      <div className="section-title"><span className="section-icon"><History size={17}/></span><h2 id="history-title">Lịch sử dự án</h2></div>
      <div className="segmented-control" role="group" aria-label="Loại lịch sử">
        <button aria-pressed={tab==="render"} className={tab==="render"?"selected":""} onClick={()=>setTab("render")}>Render ({renderVersions.length})</button>
        <button aria-pressed={tab==="prompt"} className={tab==="prompt"?"selected":""} onClick={()=>setTab("prompt")}>Prompt ({versions.length})</button>
      </div>
    </div>
    {tab==="render"?renderVersions.length?<div className="version-list">
      {renderVersions.map((v,index)=><article className={`version-card render-history-card ${activeRenderId===v.id?"is-active":""}`} key={v.id}>
        <div className="version-topline">
          <div>
            <strong>Render #{renderVersions.length-index}</strong>
            {activeRenderId === v.id && <span className="active-badge"><Check size={14}/> Đang mở</span>}
          </div>
          <time dateTime={v.createdAt}>{time(v.createdAt)}</time>
        </div>
        <button className="render-history-restore" onClick={()=>onRestoreRender(v)}>
          <span className="render-thumbnail"><Image src={v.url} alt={`Render ${renderVersions.length-index}`} fill unoptimized sizes="120px"/></span>
          <span><strong>{v.source?.name||"Phiên bản cũ chưa lưu ảnh gốc"}</strong><span className="history-prompt">{v.prompt}</span><span className="history-meta">{v.width} × {v.height} · {v.settings.quality||"Gốc"} · {v.settings.aspect_ratio||"Tỷ lệ gốc"}</span><span className="accent-text">Mở ảnh & thiết lập <ArrowUpRight size={12}/></span></span>
        </button>
        <div className="version-controls">
          <button className="text-button" onClick={()=>onDownloadRender(v)}><Download size={14}/>Tải ảnh</button>
          <button className="text-button danger-text" onClick={()=>onDeleteRender(v.id)}><Trash2 size={13}/>Bỏ khỏi lịch sử</button>
        </div>
      </article>)}
    </div>:<div className="history-empty"><History size={20}/><div><strong>Chưa có ảnh render</strong><p>Mỗi lần render lưu ảnh gốc, prompt, thiết lập và thời gian để mở lại.</p></div></div>:<>
      <button className="text-button history-filter" aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(v=>!v)}><Star size={14}/>Chỉ xem yêu thích</button>
      {prompts.length?<div className="version-list">{prompts.map(v=><article key={v.id} className={`version-card ${activeVersion===v.id?"is-active":""}`}>
        <div className="version-topline">
          <span><FileText size={14}/>{time(v.createdAt)}</span>
          <div className="version-controls">
            {activeVersion === v.id && <span className="active-badge" style={{ marginRight: '8px' }}><Check size={14}/> Đang mở</span>}
            <button className="version-star" aria-label={v.favorite?"Bỏ yêu thích prompt":"Yêu thích prompt"} aria-pressed={v.favorite} onClick={()=>onToggleFavorite(v.id)}><Star size={15} fill={v.favorite?"currentColor":"none"}/></button>
            <button className="version-delete" aria-label="Xóa phiên bản prompt" onClick={()=>onDelete(v.id)}><Trash2 size={13}/></button>
          </div>
        </div>
        <button className="version-restore" onClick={()=>onRestore(v)}><strong>{v.sourceName}</strong><p>{v.prompt}</p><span>Mở prompt & thiết lập <ArrowUpRight size={13}/></span></button>
      </article>)}</div>:<div className="history-empty"><History size={20}/><div><strong>Chưa có prompt phù hợp</strong><p>Các prompt đã tạo hoặc lưu sẽ xuất hiện tại đây.</p></div></div>}
    </>}
  </section>;
}
