"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, apiRequest, getBackendUrl } from "@/lib/api";
import { DEFAULT_SETTINGS } from "@/lib/render-settings";
import { emptyWorkspace, normalizeWorkspace, type WorkspaceState, type ProjectDocument, type ProjectSummary } from "@/lib/workspace-state";

type Identity = {id: string; revision: number} | null;
export function useProjectPersistence(data: WorkspaceState, setData: Dispatch<SetStateAction<WorkspaceState>>, blocked: boolean) {
  const [isLoaded,setLoaded]=useState(false);
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [projectId,setProjectId]=useState<string|null>(null);
  const [saveState,setSaveState]=useState("Đang mở dự án…");
  const [saveError,setSaveError]=useState("");
  const [localError,setLocalError]=useState("");
  const [saving,setSaving]=useState(false);
  const [conflict,setConflict]=useState(false);
  const current=useRef(data), busy=useRef(blocked), identity=useRef<Identity>(null);
  const synced=useRef(""), pending=useRef<Promise<boolean>|null>(null), conflictRef=useRef(false);
  const alive=useRef(true);
  useEffect(()=>{ 
    current.current=data; 
    busy.current=blocked; 
    if (conflictRef.current) {
      conflictRef.current = false;
      setConflict(false);
    }
  },[data,blocked]);

  const writeDraft=useCallback((workspace:WorkspaceState)=>{
    try {
      localStorage.setItem(`infrarender.workspace.v2:${getBackendUrl()}`,JSON.stringify({workspace,project:identity.current,synced:synced.current}));
      setLocalError("");
    } catch { setLocalError("Không lưu được bản nháp trên trình duyệt. Hãy kiểm tra trạng thái lưu máy chủ trước khi đóng trang."); }
  },[]);

  const refreshProjects=useCallback(async()=>{
    const result=await apiRequest<{projects:ProjectSummary[]}>("/api/projects");
    if(alive.current) setProjects(result.projects);
    return result.projects;
  },[]);

  useEffect(()=>{
    alive.current=true;
    const controller=new AbortController();
    async function load() {
      let loaded=emptyWorkspace(DEFAULT_SETTINGS);
      try {
        const draft=localStorage.getItem(`infrarender.workspace.v2:${getBackendUrl()}`);
        if(draft) {
          const parsed=JSON.parse(draft);
          loaded=normalizeWorkspace(parsed.workspace,DEFAULT_SETTINGS,getBackendUrl());
          if(typeof parsed.project?.id==="string" && Number.isInteger(parsed.project.revision)) identity.current=parsed.project;
          synced.current=typeof parsed.synced==="string"?parsed.synced:"";
        } else {
          const legacy=localStorage.getItem("infrarender.workspace.v1")||localStorage.getItem("infraRender_workspace");
          if(legacy) loaded=normalizeWorkspace(JSON.parse(legacy),DEFAULT_SETTINGS,getBackendUrl());
        }
      } catch { setLocalError("Bản nháp cũ không hợp lệ hoặc trình duyệt không cho phép lưu. Các dự án trên máy chủ vẫn có thể mở."); }
      try {
        const result=await apiRequest<{projects:ProjectSummary[]}>("/api/projects",{signal:controller.signal});
        if(controller.signal.aborted)return;
        setProjects(result.projects);
        if(identity.current && synced.current===JSON.stringify(loaded)) {
          const doc=await apiRequest<ProjectDocument>(`/api/projects/${identity.current.id}`,{signal:controller.signal});
          loaded=normalizeWorkspace(doc.workspace,DEFAULT_SETTINGS,getBackendUrl());
          identity.current={id:doc.id,revision:doc.revision};
          synced.current=JSON.stringify(loaded);
        }
      } catch(err) {
        if(!controller.signal.aborted) setSaveError(err instanceof Error?err.message:"Chưa kết nối được kho dự án.");
      }
      if(controller.signal.aborted)return;
      current.current=loaded;
      setData(loaded); setProjectId(identity.current?.id||null);
      setSaveState(synced.current===JSON.stringify(loaded)?"Đã lưu trên máy chủ":"Bản nháp trên thiết bị");
      setLoaded(true);
    }
    void load();
    return ()=>{alive.current=false;controller.abort();};
  },[setData]);

  const saveProject=useCallback(async():Promise<boolean>=>{
    if(busy.current || conflictRef.current)return false;
    if(pending.current)return pending.current;
    const task=(async()=>{
      await Promise.resolve();
      setSaving(true); setSaveError("");
      
      let retryLoop = true;
      while (retryLoop) {
        retryLoop = false;
        try {
          while(alive.current && !busy.current) {
            const snapshot=current.current, serialized=JSON.stringify(snapshot);
            if(serialized===synced.current)break;
            if(!identity.current && serialized===JSON.stringify(emptyWorkspace(DEFAULT_SETTINGS)))break;
            setSaveState("Đang lưu…");
            const previous=identity.current;
            const doc=await apiRequest<ProjectDocument>(previous?`/api/projects/${previous.id}`:"/api/projects",{
              method:previous?"PUT":"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({name:snapshot.projectName.trim()||"Dự án chưa đặt tên",workspace:snapshot,revision:previous?.revision})
            });
            identity.current={id:doc.id,revision:doc.revision}; synced.current=serialized;
            if(!alive.current)return true;
            setProjectId(doc.id); setSaveState("Đã lưu trên máy chủ");
            setProjects(list=>[{id:doc.id,name:doc.name,revision:doc.revision,updated_at:doc.updated_at},...list.filter(p=>p.id!==doc.id)]);
            writeDraft(current.current);
          }
          return !busy.current;
        } catch(err) {
          if(alive.current) {
            if (err instanceof ApiError && err.status === 404) {
              identity.current = null;
              conflictRef.current = false;
              setConflict(false);
              setProjectId(null);
              setSaveError(""); // Clear the error so it doesn't flash
              retryLoop = true; // Retry the loop, which will POST as a new project
              continue;
            }
            const collided=err instanceof ApiError && err.status===409;
            conflictRef.current=collided; setConflict(collided);
            setSaveError(collided?"Dự án đã thay đổi ở nơi khác hoặc ảnh tham chiếu không còn. Tải bản máy chủ hoặc lưu thành bản sao; bản nháp hiện tại vẫn được giữ.":err instanceof Error?err.message:"Không thể lưu dự án.");
            setSaveState("Chưa lưu trên máy chủ");
            writeDraft(current.current);
          }
          return false;
        }
      }
      return false;
    })().finally(() => { pending.current=null; if(alive.current)setSaving(false); });
    pending.current=task;
    return task;
  },[writeDraft]);

  useEffect(()=>{
    if(!isLoaded)return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    writeDraft(data);
    if(blocked || conflict)return;
    const timer=setTimeout(()=>void saveProject(),700);
    return ()=>clearTimeout(timer);
  },[data,isLoaded,blocked,conflict,saveProject,writeDraft]);

  useEffect(()=>{
    function beforeUnload(event:BeforeUnloadEvent) {
      const isDirty = JSON.stringify(current.current) !== synced.current;
      if (busy.current || isDirty) { 
        event.preventDefault(); 
      }
    }
    const retry=()=>{void refreshProjects().catch(()=>undefined);void saveProject();};
    window.addEventListener("beforeunload",beforeUnload);
    window.addEventListener("online",retry);
    window.addEventListener("infrarender-connection",retry);
    return ()=>{window.removeEventListener("beforeunload",beforeUnload);window.removeEventListener("online",retry);window.removeEventListener("infrarender-connection",retry);};
  },[refreshProjects,saveProject]);

  async function openProject(id:string, discard=false) {
    if(pending.current)await pending.current;
    if(!discard && !(await saveProject()))return false;
    try {
      const doc=await apiRequest<ProjectDocument>(`/api/projects/${id}`);
      const next=normalizeWorkspace(doc.workspace,DEFAULT_SETTINGS,getBackendUrl());
      identity.current={id:doc.id,revision:doc.revision};synced.current=JSON.stringify(next);current.current=next;
      conflictRef.current=false;setConflict(false);setSaveError("");setProjectId(doc.id);setData(next);writeDraft(next);setSaveState("Đã lưu trên máy chủ");
      return true;
    } catch(err) {setSaveError(err instanceof Error?err.message:"Không thể mở dự án.");return false;}
  }
  async function newProject() {
    if(!(await saveProject()))return false;
    const next=emptyWorkspace(DEFAULT_SETTINGS);
    identity.current=null;synced.current="";current.current=next;setProjectId(null);setData(next);writeDraft(next);setSaveState("Dự án mới");return true;
  }
  async function saveCopy() {
    if(pending.current)await pending.current;
    identity.current=null;synced.current="";conflictRef.current=false;setConflict(false);setProjectId(null);
    return saveProject();
  }
  async function deleteProject() {
    if(!identity.current || busy.current || !window.confirm("Xóa dự án này cùng các ảnh chỉ thuộc dự án này? Thao tác không thể hoàn tác."))return false;
    if(pending.current)await pending.current;
    try {
      await apiRequest(`/api/projects/${identity.current.id}`,{method:"DELETE"});
      identity.current=null;synced.current="";conflictRef.current=false;setConflict(false);setProjectId(null);
      const next=emptyWorkspace(DEFAULT_SETTINGS);current.current=next;setData(next);writeDraft(next);setSaveState("Đã xóa dự án");setSaveError("");
      await refreshProjects();return true;
    } catch(err) {setSaveError(err instanceof Error?err.message:"Không thể xóa dự án.");return false;}
  }
  return {isLoaded,projects,projectId,saveState,saveError:saveError||localError,saving,conflict,saveProject,openProject,newProject,saveCopy,deleteProject,
    refreshProjects:()=>refreshProjects().catch(err=>setSaveError(err instanceof Error?err.message:"Không thể tải danh sách dự án."))};
}
