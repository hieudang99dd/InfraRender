export type RenderSettings = {
  weather: string;
  lighting: string;
  vehicles: string;
  vehicles_density: string;
  vegetation: string;
  vegetation_density: string;
  buildings: string;
  buildings_density: string;
  style: string;
  camera: string;
  quality: string;
  aspect_ratio: string;
  preserve_geometry: boolean | null;
  preserve_road_markings: boolean | null;
  creativity: number | null;
  custom_keywords: string[];
};

export const MAX_CUSTOM_KEYWORDS = 20;
export const MAX_CUSTOM_KEYWORD_LENGTH = 120;

export function normalizeCustomKeyword(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export type AddCustomKeywordResult =
  | { keywords: string[]; error?: never }
  | { error: "empty" | "duplicate" | "too-long" | "limit"; keywords?: never };

export function addCustomKeyword(
  keywords: readonly string[],
  value: string,
): AddCustomKeywordResult {
  const keyword = normalizeCustomKeyword(value);
  if (!keyword) return { error: "empty" };
  if ([...keyword].length > MAX_CUSTOM_KEYWORD_LENGTH) return { error: "too-long" };
  if (
    keywords.some((entry) => normalizeCustomKeyword(entry).toLowerCase() === keyword.toLowerCase())
  ) {
    return { error: "duplicate" };
  }
  if (keywords.length >= MAX_CUSTOM_KEYWORDS) return { error: "limit" };
  return { keywords: [...keywords, keyword] };
}

export const WEATHER_VALUES = {
  sunny: "sunny weather",
  cloudy: "overcast weather",
  rain: "rainy weather",
  sunset: "sunset",
  night: "nighttime",
  mist: "light mist",
};

export const LIGHTING_VALUES = {
  natural: "natural daylight",
  golden: "warm golden-hour sunlight",
  soft: "soft diffused lighting with gentle shadows",
  cinematic: "cinematic lighting with controlled contrast",
  night: "urban street lighting",
};

export const DEFAULT_SETTINGS: RenderSettings = {
  weather: "",
  lighting: "",
  vehicles: "",
  vehicles_density: "",
  vegetation: "",
  vegetation_density: "",
  buildings: "",
  buildings_density: "",
  style: "",
  camera: "",
  quality: "",
  aspect_ratio: "",
  preserve_geometry: null,
  preserve_road_markings: null,
  creativity: null,
  custom_keywords: [],
};

export function updateRenderSetting<K extends keyof RenderSettings>(
  settings: RenderSettings,
  key: K,
  value: RenderSettings[K],
): RenderSettings {
  return { ...settings, [key]: value };
}

export function isDefaultRenderSettings(settings: RenderSettings): boolean {
  return (
    settings.weather === DEFAULT_SETTINGS.weather &&
    settings.lighting === DEFAULT_SETTINGS.lighting &&
    settings.vehicles === DEFAULT_SETTINGS.vehicles &&
    settings.vehicles_density === DEFAULT_SETTINGS.vehicles_density &&
    settings.vegetation === DEFAULT_SETTINGS.vegetation &&
    settings.vegetation_density === DEFAULT_SETTINGS.vegetation_density &&
    settings.buildings === DEFAULT_SETTINGS.buildings &&
    settings.buildings_density === DEFAULT_SETTINGS.buildings_density &&
    settings.style === DEFAULT_SETTINGS.style &&
    settings.camera === DEFAULT_SETTINGS.camera &&
    settings.quality === DEFAULT_SETTINGS.quality &&
    settings.aspect_ratio === DEFAULT_SETTINGS.aspect_ratio &&
    settings.preserve_geometry === DEFAULT_SETTINGS.preserve_geometry &&
    settings.preserve_road_markings === DEFAULT_SETTINGS.preserve_road_markings &&
    settings.creativity === DEFAULT_SETTINGS.creativity &&
    settings.custom_keywords.length === 0
  );
}

export function getOutputSummary(settings: RenderSettings): string {
  const quality = !settings.quality || settings.quality === "Original" ? "Gốc" : settings.quality;
  const ratio = !settings.aspect_ratio || settings.aspect_ratio === "Original" ? "Tỷ lệ gốc" : settings.aspect_ratio;
  return `${quality} · ${ratio}`;
}

export function toPromptRequest(
  settings: RenderSettings,
  notes: string,
): Partial<RenderSettings> & { notes: string } {
  const selected = Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) => key !== "custom_keywords" && value !== "" && value !== null,
    ),
  );

  const seen = new Set<string>();
  const keywords = (settings.custom_keywords ?? [])
    .map(normalizeCustomKeyword)
    .filter((keyword) => {
      const key = keyword.toLowerCase();
      if (!keyword || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    ...selected,
    ...(keywords.length ? { custom_keywords: keywords } : {}),
    notes: notes.trim(),
  };
}
