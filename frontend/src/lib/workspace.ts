import type { RenderSettings } from "./render-settings";
import type { OutputDetails } from "./api";

export type StoredSource = {
  saved_name: string;
  url: string;
  name: string;
  size: string;
  resolution: string;
};

export type PromptVersion = {
  id: string;
  createdAt: string;
  prompt: string;
  negativePrompt: string;
  settings: RenderSettings;
  notes: string;
  sourceName: string;
  generatedFrom: string;
  favorite: boolean;
};

export type RenderVersion = {
  id: string;
  createdAt: string;
  url: string;
  name: string;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  settings: RenderSettings;
  notes: string;
  projectName: string;
  provider: string;
  model: string;
  source?: StoredSource | null;
  details?: OutputDetails;
};

export function promptSignature(settings: RenderSettings, notes: string, sourceId: string | null) {
  return JSON.stringify({ settings, notes, sourceId });
}

export function downloadPrompt(name: string, prompt: string, negativePrompt: string) {
  const content = `${name}\n\nPROMPT CHÍNH\n${prompt}\n\nNỘI DUNG LOẠI TRỪ\n${negativePrompt}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "InfraRender"}-prompt.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
