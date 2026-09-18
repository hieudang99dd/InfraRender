import type { RenderSettings } from "./render-settings";
import type { PromptMode } from "./api";
import type { PromptVersion, RenderVersion, StoredSource } from "./workspace";

export type WorkspaceState = {
  schemaVersion: number; projectName: string; source: StoredSource | null;
  settings: RenderSettings; notes: string; prompt: string; negativePrompt: string;
  versions: PromptVersion[]; renderVersions: RenderVersion[];
  activeVersion: string | null; activeRenderId: string | null; generatedFrom: string;
  promptMode: PromptMode; promptAnalysis: string[]; promptModel: string | null;
};
export type ProjectSummary = {id: string; name: string; revision: number; updated_at: string};
export type ProjectDocument = ProjectSummary & {workspace: WorkspaceState};

export function emptyWorkspace(defaults: RenderSettings): WorkspaceState {
  return {schemaVersion:2, projectName:"Dự án hạ tầng mới", source:null, settings:{...defaults,custom_keywords:[]},
    notes:"",prompt:"",negativePrompt:"",versions:[],renderVersions:[],activeVersion:null,activeRenderId:null,
    generatedFrom:"",promptMode:"template",promptAnalysis:[],promptModel:null};
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
function text(value: unknown, max = 28000) { return typeof value === "string" ? value.slice(0,max) : ""; }
const mediaName = /^[a-f0-9]{32}\.(?:png|jpg|jpeg|webp)$/;

function readSettings(value: unknown, defaults: RenderSettings): RenderSettings {
  const result = {...defaults, custom_keywords:[] as string[]};
  const data = record(value);
  for (const key of Object.keys(defaults) as (keyof RenderSettings)[]) {
    const val = data[key];
    if (key === "custom_keywords") {
      if (Array.isArray(val)) result.custom_keywords = val.filter((v): v is string => typeof v === "string" && [...v].length <=120).slice(0,20);
    } else if (key === "creativity") {
      if (typeof val === "number" && Number.isInteger(val) && val >=0 && val <=100) result.creativity=val;
    } else if (key === "preserve_geometry" || key === "preserve_road_markings") {
      if (typeof val === "boolean") result[key]=val;
    } else if (typeof val === "string") result[key]=val.slice(0,2000);
  }
  if (!["","Original","1K","2K","4K","8K"].includes(result.quality)) result.quality="";
  if (result.aspect_ratio && !/^(Original|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$/.test(result.aspect_ratio)) result.aspect_ratio="";
  return result;
}
function readSource(value: unknown, backend: string): StoredSource | null {
  const data=record(value), name=text(data.saved_name,100);
  if (!mediaName.test(name)) return null;
  return {saved_name:name,url:`${backend}/uploads/${name}`,name:text(data.name,200)||name,size:text(data.size,100),resolution:text(data.resolution,100)};
}
export function normalizeWorkspace(value: unknown, defaults: RenderSettings, backend: string): WorkspaceState {
  const data=record(value), result=emptyWorkspace(defaults);
  result.projectName=text(data.projectName,200)||result.projectName;
  result.settings=readSettings(data.settings,defaults);
  result.source=readSource(data.source,backend);
  result.prompt=text(data.prompt); result.negativePrompt=text(data.negativePrompt,4000); result.notes=text(data.notes,5000);
  result.generatedFrom=text(data.generatedFrom,50000);
  if (["template","refine","vision"].includes(String(data.promptMode))) result.promptMode=data.promptMode as PromptMode;
  result.promptAnalysis=Array.isArray(data.promptAnalysis)?data.promptAnalysis.filter((v):v is string=>typeof v==="string").slice(0,12):[];
  result.promptModel=text(data.promptModel,200)||null;
  if (Array.isArray(data.versions)) result.versions=data.versions.filter(v=>v && typeof v.id==="string" && typeof v.prompt==="string" && typeof v.createdAt==="string").slice(0,200).map(v=>({
    id:text(v.id,200),createdAt:text(v.createdAt,100),prompt:text(v.prompt),negativePrompt:text(v.negativePrompt,4000),settings:readSettings(v.settings,defaults),notes:text(v.notes,5000),sourceName:text(v.sourceName,200),generatedFrom:text(v.generatedFrom,50000),favorite:v.favorite===true
  }));
  // Migration: older API/LocalStorage versions stored render history under 'renderHistory'.
  // If 'renderVersions' is absent or empty, fall back to 'renderHistory' before discarding.
  const rawRenderVersions = (Array.isArray(data.renderVersions) && data.renderVersions.length > 0)
    ? data.renderVersions
    : (Array.isArray(data.renderHistory) ? data.renderHistory : []);

  if (rawRenderVersions.length > 0) result.renderVersions = rawRenderVersions
    .filter(v => v && typeof v.id === "string" && mediaName.test(v.name) && typeof v.prompt === "string" && Number.isInteger(v.width) && v.width > 0 && Number.isInteger(v.height) && v.height > 0)
    .slice(0, 200)
    .map(v => ({
      id: text(v.id, 200), createdAt: text(v.createdAt, 100), name: v.name, url: `${backend}/outputs/${v.name}`,
      width: v.width, height: v.height, prompt: text(v.prompt), negativePrompt: text(v.negativePrompt, 4000),
      settings: readSettings(v.settings, defaults), notes: text(v.notes, 5000),
      projectName: text(v.projectName, 200), provider: text(v.provider, 200), model: text(v.model, 200),
      source: readSource(v.source, backend),
      details: { native_size: text(record(v.details).native_size, 50), final_size: text(record(v.details).final_size, 50), provider_size: text(record(v.details).provider_size, 50), processing: text(record(v.details).processing, 50), upscaled: record(v.details).upscaled === true, cropped: record(v.details).cropped === true, experimental: record(v.details).experimental === true }
    }));
  result.activeVersion=result.versions.some(v=>v.id===data.activeVersion)?data.activeVersion as string:null;
  result.activeRenderId=result.renderVersions.some(v=>v.id===data.activeRenderId)?data.activeRenderId as string:null;
  return result;
}
export function restoreRender(state: WorkspaceState, version: RenderVersion): WorkspaceState {
  return {...state,source:version.source||null,prompt:version.prompt,negativePrompt:version.negativePrompt,
    settings:{...version.settings},notes:version.notes,activeRenderId:version.id,activeVersion:null,
    generatedFrom:"",promptAnalysis:[],promptModel:null};
}
