"use client";
import { useEffect, useRef, useState } from "react";
import type { ImageChangePayload } from "@/components/workspace/ImageCanvas";
import { apiRequest, uploadImage, requestRender, type PromptMode, type PromptResponse, type RenderResponse } from "@/lib/api";
import { DEFAULT_SETTINGS, toPromptRequest, type RenderSettings } from "@/lib/render-settings";
import { downloadPrompt, promptSignature, type PromptVersion, type RenderVersion, type StoredSource } from "@/lib/workspace";
import { emptyWorkspace, restoreRender, type WorkspaceState } from "@/lib/workspace-state";
import { useProjectPersistence } from "./useProjectPersistence";

export function useWorkspace() {
  const [data,setData]=useState(()=>emptyWorkspace(DEFAULT_SETTINGS));
  const [preview,setPreview]=useState<ImageChangePayload|null>(null);
  const [projectRevision,setProjectRevision]=useState(0);
  const [isUploading,setUploading]=useState(false);
  const [isGenerating,setGenerating]=useState(false);
  const [isRendering,setRendering]=useState(false);
  const [isDownloading,setDownloading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const uploadRef=useRef<AbortController|null>(null), generationRef=useRef<AbortController|null>(null);
  const renderRef=useRef<AbortController|null>(null), downloadRef=useRef<AbortController|null>(null);
  const previewRef=useRef<ImageChangePayload|null>(null);
  const persistence=useProjectPersistence(data,setData,isUploading);
  const source=preview || data.source;
  const renderedImage=data.renderVersions.find(v=>v.id===data.activeRenderId)||null;
  const currentSignature=promptSignature(data.settings,data.notes,data.source?.saved_name||null);

  useEffect(()=>()=>{uploadRef.current?.abort();generationRef.current?.abort();renderRef.current?.abort();downloadRef.current?.abort();
    if(previewRef.current?.url.startsWith("blob:"))URL.revokeObjectURL(previewRef.current.url);
  },[]);
  function patch(next:Partial<WorkspaceState>) {setData(current=>({...current,...next}));}
  function clearPreview() {
    if(previewRef.current?.url.startsWith("blob:"))URL.revokeObjectURL(previewRef.current.url);
    previewRef.current=null;setPreview(null);
  }
  function cancelRequests() {
    uploadRef.current?.abort();generationRef.current?.abort();renderRef.current?.abort();downloadRef.current?.abort();
    uploadRef.current=null;generationRef.current=null;renderRef.current=null;downloadRef.current=null;
    setUploading(false);setGenerating(false);setRendering(false);setDownloading(false);
  }
  async function changeSource(next:ImageChangePayload|null) {
    cancelRequests();clearPreview();setError("");setNotice("");
    // Preserve the current source so we can roll back if the upload fails.
    const previousSource=data.source;
    patch({source:null,activeRenderId:null});
    if(!next){return;}
    previewRef.current=next;setPreview(next);
    const controller=new AbortController();uploadRef.current=controller;setUploading(true);
    try {
      const result=await uploadImage(next.file,controller.signal);
      if(controller.signal.aborted){
        // Upload was cancelled — restore the previous image so autosave doesn't write source:null.
        patch({source:previousSource});
        return;
      }
      const stored:StoredSource={saved_name:result.saved_name,url:result.url,name:next.name,size:next.size,resolution:next.resolution};
      patch({source:stored});clearPreview();setNotice("Đã lưu ảnh gốc. Dự án sẽ tự động lưu.");
    } catch(err) {
      // Restore the old image so the project remains valid.
      patch({source:previousSource});
      if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Không thể lưu ảnh gốc. Ảnh tham chiếu trước đó đã được giữ lại.");
    } finally {if(uploadRef.current===controller){uploadRef.current=null;setUploading(false);}}
  }
  function makeVersion(text:string,signature:string):PromptVersion {
    return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),prompt:text,negativePrompt:data.negativePrompt,settings:{...data.settings},
      notes:data.notes,sourceName:source?.name||"Không có ảnh",generatedFrom:signature,favorite:false};
  }
  async function generatePrompt() {
    if(!data.source || isUploading || renderRef.current || generationRef.current)return;
    if(data.versions.length>=200){setError("Lịch sử đã có 200 prompt. Xóa phiên bản không cần trước khi tạo tiếp.");return;}
    const controller=new AbortController();generationRef.current=controller;setGenerating(true);setError("");setNotice("");
    try {
      const result=await apiRequest<PromptResponse>("/api/generate-prompt",{
        method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,
        body:JSON.stringify({...toPromptRequest(data.settings,data.notes),reference_image_name:data.source.saved_name,mode:data.promptMode})
      },75000);
      if(controller.signal.aborted)return;
      if(typeof result.prompt!=="string" || !result.prompt.trim())throw new Error("Dịch vụ chưa trả về prompt hợp lệ.");
      const version=makeVersion(result.prompt,currentSignature);
      setData(current=>({...current,prompt:result.prompt,generatedFrom:currentSignature,activeVersion:version.id,versions:[version,...current.versions],
        promptAnalysis:result.analysis,promptModel:result.model}));
      setNotice(result.mode==="template"?"Đã tạo prompt tiếng Việt theo thiết lập.":"Đã tạo prompt tiếng Việt bằng AI và lưu nhận xét.");
    } catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Không thể tạo prompt.");}
    finally {if(generationRef.current===controller){generationRef.current=null;setGenerating(false);}}
  }
  async function renderImage() {
    if(!data.source || !data.prompt.trim() || isUploading || generationRef.current || renderRef.current)return;
    if(data.renderVersions.length>=200){setError("Lịch sử đã có 200 ảnh. Xóa phiên bản không cần trước khi render tiếp.");return;}
    const controller=new AbortController();renderRef.current=controller;setRendering(true);setError("");setNotice("");
    try {
      if(!(await persistence.saveProject()))throw new Error("Hãy lưu dự án thành công trước khi dựng ảnh.");
      if(controller.signal.aborted)return;
      const result=await requestRender({prompt:data.prompt,negative_prompt:data.negativePrompt,reference_image_name:data.source.saved_name,
        settings:toPromptRequest(data.settings,data.notes),project_name:data.projectName},controller.signal);
      if(controller.signal.aborted)return;
      if(!result.url || !result.name || !result.width || !result.height)throw new Error("Dịch vụ chưa trả về ảnh hợp lệ.");
      const version:RenderVersion={...result,id:crypto.randomUUID(),createdAt:new Date().toISOString(),prompt:data.prompt,negativePrompt:data.negativePrompt,
        settings:{...data.settings},notes:data.notes,projectName:data.projectName,source:{...data.source}};
      setData(current=>({...current,renderVersions:[version,...current.renderVersions],activeRenderId:version.id}));
      setNotice("Đã dựng ảnh và thêm vào lịch sử. Đang lưu dự án…");
      window.dispatchEvent(new Event("infrarender-rendered"));
    } catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Không thể dựng phối cảnh.");}
    finally {if(renderRef.current===controller){renderRef.current=null;setRendering(false);}}
  }
  async function downloadImage(version:RenderVersion|RenderResponse|null=renderedImage) {
    if(!version || downloadRef.current)return;
    const controller=new AbortController();downloadRef.current=controller;setDownloading(true);setError("");
    try {
      const response=await fetch(version.url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
      if(!response.ok)throw new Error("Không thể tải ảnh. Ảnh có thể đã bị xóa trên máy chủ.");
      const blob=await response.blob();if(controller.signal.aborted)return;
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=version.name;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Không thể tải ảnh.");}
    finally {if(downloadRef.current===controller){downloadRef.current=null;setDownloading(false);}}
  }
  function restoreRenderVersion(version:RenderVersion) {
    cancelRequests();clearPreview();setData(current=>restoreRender(current,version));setProjectRevision(v=>v+1);setError("");
    setNotice(version.source?"Đã mở đúng ảnh gốc, ảnh render và thiết lập của phiên bản.":"Phiên bản cũ không lưu ảnh gốc. Cần chọn lại ảnh để tiếp tục.");
  }
  function restoreVersion(version:PromptVersion) {
    cancelRequests();patch({prompt:version.prompt,negativePrompt:version.negativePrompt,settings:{...version.settings},notes:version.notes,
      activeVersion:version.id,generatedFrom:version.generatedFrom,promptAnalysis:[],promptModel:null});setError("");
    setNotice("Đã khôi phục prompt và thiết lập. Kiểm tra ảnh gốc trước khi dựng.");
  }
  async function switchProject(id:string,discard=false) {
    if(isGenerating || isRendering || isUploading)return;
    if(await persistence.openProject(id,discard)){clearPreview();setProjectRevision(v=>v+1);setError("");setNotice("");}
  }
  async function resetProject() {
    if(isGenerating || isRendering || isUploading)return;
    if(await persistence.newProject()){clearPreview();setProjectRevision(v=>v+1);setError("");setNotice("Dự án trước đã được giữ trong danh sách.");}
  }
  return {...data,...persistence,source,renderedImage,projectRevision,isUploading,isGenerating,isRendering,isDownloading,error,notice,
    isStale:Boolean(data.prompt && data.generatedFrom && data.generatedFrom!==currentSignature),
    setProjectName:(projectName:string)=>patch({projectName}),
    setSettings:(settings:RenderSettings)=>patch({settings}),
    setNotes:(notes:string)=>patch({notes}),
    setPrompt:(prompt:string)=>patch({prompt,activeVersion:null}),
    setNegativePrompt:(negativePrompt:string)=>patch({negativePrompt,activeVersion:null}),
    setPromptMode:(promptMode:PromptMode)=>patch({promptMode}),
    changeSource,generatePrompt,renderImage,downloadImage,restoreRenderVersion,restoreVersion,resetProject,switchProject,
    reloadProject:()=>{if(persistence.projectId && window.confirm("Mở bản đã lưu trên máy chủ và bỏ các thay đổi chưa lưu trên thiết bị?"))void switchProject(persistence.projectId,true);},
    deleteCurrentProject:async()=>{if(await persistence.deleteProject()){clearPreview();setProjectRevision(v=>v+1);}},
    clearPrompt:(mode:"prompt"|"negative")=>{cancelRequests();patch(mode==="prompt"?{prompt:"",generatedFrom:"",activeVersion:null,promptAnalysis:[],promptModel:null}:{negativePrompt:"",activeVersion:null});},
    deleteVersion:(id:string)=>setData(current=>({...current,versions:current.versions.filter(v=>v.id!==id),activeVersion:current.activeVersion===id?null:current.activeVersion})),
    deleteRenderVersion:(id:string)=>{setData(current=>({...current,renderVersions:current.renderVersions.filter(v=>v.id!==id),activeRenderId:current.activeRenderId===id?null:current.activeRenderId}));setNotice("Đã bỏ khỏi lịch sử. Tệp không còn được sử dụng sẽ được dọn theo thời hạn lưu trữ.");},
    removeRenderedImage:()=>patch({activeRenderId:null}),
    saveVersion:()=>{if(!data.prompt.trim())return;if(data.versions.length>=200){setError("Lịch sử đã đủ 200 prompt.");return;}const version=makeVersion(data.prompt,data.generatedFrom||currentSignature);setData(current=>({...current,versions:[version,...current.versions],activeVersion:version.id}));},
    toggleFavorite:(id:string)=>setData(current=>({...current,versions:current.versions.map(v=>v.id===id?{...v,favorite:!v.favorite}:v)})),
    exportPrompt:()=>downloadPrompt(data.projectName,data.prompt,data.negativePrompt),
  };
}
