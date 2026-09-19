"use client";

import {
  Building2,
  Camera,
  Cloud,
  CloudRain,
  CloudSun,
  Leaf,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Sunset,
  Tags,
  X,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

import SettingSection from "@/components/render/SettingSection";
import OptionChip from "@/components/ui/OptionChip";
import {
  DEFAULT_SETTINGS,
  LIGHTING_VALUES,
  MAX_CUSTOM_KEYWORDS,
  MAX_CUSTOM_KEYWORD_LENGTH,
  WEATHER_VALUES,
  addCustomKeyword,
  type RenderSettings,
  updateRenderSetting,
} from "@/lib/render-settings";

import styles from "./RightPanel.module.css";

type RightPanelProps = {
  settings: RenderSettings;
  onChange: (settings: RenderSettings) => void;
  isGenerating: boolean;
  isRendering: boolean;
  canGenerate: boolean;
};

type Option = { label: string; value: string; icon?: ReactNode };
type ChoiceField = Exclude<
  keyof RenderSettings,
  "preserve_geometry" | "preserve_road_markings" | "creativity" | "custom_keywords"
>;

const DENSITY_OPTIONS: Option[] = [
  { label: "Không có", value: "none" },
  { label: "Thưa thớt", value: "sparse" },
  { label: "Trung bình", value: "moderate" },
  { label: "Dày đặc", value: "dense" },
];

const OPTIONS: Record<ChoiceField, Option[]> = {
  infrastructure: [
    { label: "Biển báo và đèn giao thông", value: "traffic signs and traffic lights" },
    { label: "Cột đèn chiếu sáng", value: "street lighting poles" },
    { label: "Vỉa hè và lối đi bộ", value: "sidewalks and pedestrian paths" },
    { label: "Dải phân cách", value: "median strips and barriers" },
  ],
  roads: [
    { label: "Đường nhựa (Asphalt)", value: "asphalt road surface" },
    { label: "Đường bê tông", value: "concrete road surface" },
    { label: "Đường lát gạch", value: "paved stone road" },
    { label: "Đường đất", value: "dirt road" },
  ],
  materials: [
    { label: "Kính và Thép hiện đại", value: "modern glass and steel materials" },
    { label: "Bê tông trần (Brutalism)", value: "exposed raw concrete" },
    { label: "Gạch đỏ truyền thống", value: "traditional red brick walls" },
    { label: "Gỗ tự nhiên", value: "natural wood finishes" },
    { label: "Đá ốp lát", value: "stone cladding" },
  ],
  weather: [
    { label: "Nắng", value: WEATHER_VALUES.sunny, icon: <Sun size={14} /> },
    { label: "Có mây", value: WEATHER_VALUES.cloudy, icon: <Cloud size={14} /> },
    { label: "Mưa", value: WEATHER_VALUES.rain, icon: <CloudRain size={14} /> },
    { label: "Hoàng hôn", value: WEATHER_VALUES.sunset, icon: <Sunset size={14} /> },
    { label: "Ban đêm", value: WEATHER_VALUES.night, icon: <Moon size={14} /> },
    { label: "Sương mù nhẹ", value: WEATHER_VALUES.mist, icon: <CloudSun size={14} /> },
  ],
  lighting: [
    { label: "Ánh sáng ban ngày", value: LIGHTING_VALUES.natural },
    { label: "Giờ vàng", value: LIGHTING_VALUES.golden },
    { label: "Ánh sáng dịu", value: LIGHTING_VALUES.soft },
    { label: "Điện ảnh", value: LIGHTING_VALUES.cinematic },
    { label: "Chiếu sáng đô thị", value: LIGHTING_VALUES.night },
  ],
  vegetation: [
    { label: "Cây nhiệt đới", value: "tropical vegetation" },
    { label: "Cây đô thị & vỉa hè", value: "urban landscape planting" },
    { label: "Cỏ & thảm phủ đất", value: "grass and ground-cover plants" },
    { label: "Cây bụi & hoa cảnh", value: "flowering plants and shrubs" },
  ],
  vegetation_density: DENSITY_OPTIONS,
  vehicles: [
    { label: "Ô tô con", value: "cars" },
    { label: "Xe máy", value: "motorcycles" },
    { label: "Hỗn hợp", value: "mixed vehicle types" },
    { label: "Xe tải hàng", value: "trucks" },
  ],
  vehicles_density: DENSITY_OPTIONS,
  buildings: [
    { label: "Hiện đại", value: "modern architecture" },
    { label: "Thương mại", value: "commercial buildings" },
    { label: "Khu dân cư", value: "residential buildings" },
    { label: "Công nghiệp", value: "industrial buildings" },
  ],
  buildings_density: DENSITY_OPTIONS,
  style: [
    { label: "Chân thực", value: "photorealistic visualization" },
    { label: "Phối cảnh kỹ thuật", value: "clean professional architectural presentation" },
    { label: "Điện ảnh", value: "cinematic visualization with atmospheric color grading" },
    { label: "Minh họa thiết kế", value: "refined architectural illustration with clear forms" },
  ],
  camera: [
    { label: "Giữ góc ảnh gốc", value: "preserve the original camera perspective" },
    {
      label: "Góc nhìn trên cao",
      value: "aerial drone perspective showing the complete site",
    },
    {
      label: "Góc rộng kiến trúc",
      value: "wide architectural perspective with straight verticals",
    },
    { label: "Góc người đi bộ", value: "human eye-level perspective with a natural focal length" },
  ],
  quality: [
    { label: "Giữ nguyên gốc", value: "Original" },
    { label: "2K", value: "2K" },
    { label: "4K", value: "4K" },
  ],
  aspect_ratio: [
    { label: "Giữ nguyên gốc", value: "Original" },
    { label: "16:9 (Ngang)", value: "16:9" },
    { label: "4:3 (Chuẩn)", value: "4:3" },
  ],
};

function PreservationChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  const id = useId();

  return (
    <div className={styles.preservation}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        data-empty={value === null}
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : event.target.value === "true")
        }
      >
        <option value="">Chưa chọn</option>
        <option value="true">Giữ nguyên</option>
        <option value="false">Cho phép đổi</option>
      </select>
    </div>
  );
}

const QUICK_PRESETS = [
  {
    id: "hien_trang",
    label: "Hiện trạng",
    apply: (settings: RenderSettings): RenderSettings => ({
      ...settings,
      preserve_geometry: true,
      preserve_road_markings: true,
      camera: "preserve the original camera perspective",
      creativity: 1,
      style: "photorealistic visualization",
    }),
    matches: (settings: RenderSettings) =>
      settings.preserve_geometry === true &&
      settings.preserve_road_markings === true &&
      settings.camera === "preserve the original camera perspective" &&
      settings.creativity === 1 &&
      settings.style === "photorealistic visualization",
  },
  {
    id: "ban_ngay",
    label: "Ban ngày",
    apply: (settings: RenderSettings): RenderSettings => ({
      ...settings,
      weather: WEATHER_VALUES.sunny,
      lighting: LIGHTING_VALUES.natural,
      style: "photorealistic visualization",
    }),
    matches: (settings: RenderSettings) =>
      settings.weather === WEATHER_VALUES.sunny &&
      settings.lighting === LIGHTING_VALUES.natural &&
      settings.style === "photorealistic visualization",
  },
  {
    id: "hoang_hon",
    label: "Hoàng hôn",
    apply: (settings: RenderSettings): RenderSettings => ({
      ...settings,
      weather: WEATHER_VALUES.sunset,
      lighting: LIGHTING_VALUES.golden,
      style: "photorealistic visualization",
    }),
    matches: (settings: RenderSettings) =>
      settings.weather === WEATHER_VALUES.sunset &&
      settings.lighting === LIGHTING_VALUES.golden &&
      settings.style === "photorealistic visualization",
  },
  {
    id: "ban_dem",
    label: "Ban đêm",
    apply: (settings: RenderSettings): RenderSettings => ({
      ...settings,
      weather: WEATHER_VALUES.night,
      lighting: LIGHTING_VALUES.night,
      style: "photorealistic visualization",
    }),
    matches: (settings: RenderSettings) =>
      settings.weather === WEATHER_VALUES.night &&
      settings.lighting === LIGHTING_VALUES.night &&
      settings.style === "photorealistic visualization",
  },
  {
    id: "canh_quan",
    label: "Cảnh quan đô thị",
    apply: (settings: RenderSettings): RenderSettings => ({
      ...settings,
      vegetation: "urban landscape planting",
      vegetation_density: "dense",
      style: "photorealistic visualization",
    }),
    matches: (settings: RenderSettings) =>
      settings.vegetation === "urban landscape planting" &&
      settings.vegetation_density === "dense" &&
      settings.style === "photorealistic visualization",
  },
];

export default function RightPanel({
  settings,
  onChange,
  isGenerating,
  isRendering,
  canGenerate,
}: RightPanelProps) {
  const id = useId();
  const isBusy = isGenerating || isRendering;
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordError, setKeywordError] = useState("");
  const keywordInput = useRef<HTMLInputElement>(null);
  const customKeywords = settings.custom_keywords ?? [];

  function update<K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) {
    onChange(updateRenderSetting(settings, key, value));
  }

  function addKeyword() {
    const result = addCustomKeyword(customKeywords, keywordDraft);
    if (result.error) {
      const messages = {
        empty: "Nhập một từ khóa hoặc cụm từ trước khi thêm.",
        duplicate: "Từ khóa này đã có trong danh sách.",
        "too-long": `Mỗi từ khóa tối đa ${MAX_CUSTOM_KEYWORD_LENGTH} ký tự.`,
        limit: `Bạn đã thêm ${MAX_CUSTOM_KEYWORDS} từ khóa. Xóa một từ khóa để thêm ý tưởng mới.`,
      };
      setKeywordError(messages[result.error]);
      return;
    }
    update("custom_keywords", result.keywords);
    setKeywordDraft("");
    setKeywordError("");
    keywordInput.current?.focus();
  }

  function choices(field: ChoiceField, label: string, threeColumns = false) {
    return (
      <div
        role="group"
        aria-label={label}
        className={`${styles.options} ${threeColumns ? styles.threeColumns : ""}`}
      >
        {OPTIONS[field].map((option) => (
          <OptionChip
            key={option.value}
            label={option.label}
            icon={option.icon}
            active={settings[field] === option.value}
            onClick={() => update(field, settings[field] === option.value ? "" : option.value)}
          />
        ))}
      </div>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Thông số thiết kế">
      <header className={styles.header}>
        <div className={styles.heading}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          <h2>Thông số thiết kế</h2>
        </div>
        <button
          type="button"
          className={styles.reset}
          onClick={() => {
            onChange({ ...DEFAULT_SETTINGS, custom_keywords: [] });
            setKeywordDraft("");
            setKeywordError("");
          }}
          disabled={isBusy}
          title="Đặt lại toàn bộ thông số về mặc định"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Đặt lại
        </button>
      </header>

      <fieldset className={styles.settings} disabled={isBusy} aria-label="Thông số thiết kế">
        <div className={styles.quickPresets}>
          <p className={styles.presetLabel} id="quick-presets-label">
            Thiết lập nhanh
          </p>
          <div className={styles.presetList}>
            {QUICK_PRESETS.map((preset) => {
              const isActive = preset.matches(settings);
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`${styles.presetChip} ${isActive ? styles.active : ""}`}
                  aria-pressed={isActive}
                  disabled={isBusy}
                  onClick={() => onChange(preset.apply(settings))}
                  title={`Áp dụng preset: ${preset.label}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className={styles.selectionHint}>
          Chọn thông số hoặc thêm từ khóa riêng. Nhấn lại một lựa chọn để bỏ chọn.
        </p>

        {/* 01. Mức độ can thiệp */}
        <SettingSection title="Mức độ can thiệp" icon={<ShieldCheck size={17} />} defaultOpen>
          <PreservationChoice
            label="Bảo toàn hình khối công trình"
            value={settings.preserve_geometry}
            onChange={(value) => update("preserve_geometry", value)}
          />
          <PreservationChoice
            label="Giữ vạch sơn mặt đường"
            value={settings.preserve_road_markings}
            onChange={(value) => update("preserve_road_markings", value)}
          />
          <div className={`${styles.rangeLabel} ${styles.rangeLabelWithMargin}`}>
            <label htmlFor={`${id}-creativity`}>Mức độ tự do sáng tạo (%)</label>
            <button
              type="button"
              className={styles.clear}
              aria-label="Bỏ chọn tự do sáng tạo"
              disabled={settings.creativity === null}
              onClick={() => update("creativity", null)}
            >
              Bỏ chọn
            </button>
          </div>
          <input
            id={`${id}-creativity`}
            className={styles.select}
            type="number"
            min={0}
            max={100}
            step={1}
            placeholder="Chưa chọn"
            value={settings.creativity ?? ""}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              update(
                "creativity",
                Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : null,
              );
            }}
          />
          {settings.creativity !== null && (
            <>
              <input
                className={styles.range}
                type="range"
                aria-label="Điều chỉnh mức độ tự do sáng tạo"
                min={0}
                max={100}
                step={1}
                value={settings.creativity}
                onChange={(event) => update("creativity", Number(event.target.value))}
              />
              <div className={styles.rangeHints}>
                <span>Bám sát ảnh gốc</span>
                <span>Tự do sáng tạo</span>
              </div>
            </>
          )}
        </SettingSection>

        {/* 02. Góc nhìn */}
        <SettingSection title="Góc nhìn" icon={<Camera size={17} />}>
          <select
            id={`${id}-camera`}
            className={styles.select}
            data-empty={!settings.camera}
            value={settings.camera}
            onChange={(event) => update("camera", event.target.value)}
          >
            <option value="">Chưa chọn</option>
            {OPTIONS.camera.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingSection>

        {/* 03. Công trình & hạ tầng */}
        <SettingSection title="Công trình & hạ tầng" icon={<Building2 size={17} />}>
          <p className={styles.fieldLabel}>Loại công trình</p>
          {choices("buildings", "Loại công trình")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Mật độ công trình</p>
          {choices("buildings_density", "Mật độ công trình")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Hạ tầng bổ sung</p>
          {choices("infrastructure", "Hạ tầng bổ sung")}
        </SettingSection>

        {/* 04. Giao thông */}
        <SettingSection title="Giao thông" icon={<Route size={17} />}>
          <p className={styles.fieldLabel}>Loại phương tiện</p>
          {choices("vehicles", "Loại phương tiện")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Mật độ phương tiện</p>
          {choices("vehicles_density", "Mật độ phương tiện")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Mặt đường</p>
          {choices("roads", "Mặt đường")}
        </SettingSection>

        {/* 05. Cây xanh */}
        <SettingSection title="Cây xanh" icon={<Leaf size={17} />}>
          <p className={styles.fieldLabel}>Loại thảm thực vật</p>
          {choices("vegetation", "Loại thảm thực vật")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Mật độ phủ xanh</p>
          {choices("vegetation_density", "Mật độ phủ xanh")}
        </SettingSection>

        {/* 06. Thời tiết & ánh sáng */}
        <SettingSection title="Thời tiết & ánh sáng" icon={<CloudSun size={17} />}>
          <p className={styles.fieldLabel}>Thời tiết</p>
          {choices("weather", "Thời tiết", true)}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Ánh sáng</p>
          {choices("lighting", "Ánh sáng")}
        </SettingSection>

        {/* 07. Phong cách */}
        <SettingSection title="Phong cách" icon={<Palette size={17} />}>
          {choices("style", "Phong cách")}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Vật liệu chủ đạo</p>
          {choices("materials", "Vật liệu chủ đạo")}
        </SettingSection>

        {/* 08. Đầu ra */}
        <SettingSection title="Đầu ra" icon={<SlidersHorizontal size={17} />}>
          <p className={styles.fieldLabel}>Độ phân giải</p>
          {choices("quality", "Độ phân giải", true)}
          <p className={`${styles.fieldLabel} ${styles.spacedLabel}`}>Tỷ lệ khung hình</p>
          {choices("aspect_ratio", "Tỷ lệ khung hình", true)}
        </SettingSection>

        {/* 09. Yêu cầu bổ sung */}
        <SettingSection title="Yêu cầu bổ sung" icon={<Tags size={17} />}>
          <div className={styles.keywordEntry}>
            <input
              ref={keywordInput}
              id={`${id}-keyword`}
              className={styles.select}
              type="text"
              placeholder="Ví dụ: tường gạch đỏ, biển báo..."
              value={keywordDraft}
              aria-invalid={Boolean(keywordError)}
              aria-describedby={keywordError ? `${id}-keyword-error` : undefined}
              onChange={(event) => {
                setKeywordDraft(event.target.value);
                setKeywordError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addKeyword();
                }
              }}
            />
            <button
              type="button"
              className={styles.keywordAdd}
              onClick={addKeyword}
              disabled={!keywordDraft.trim()}
            >
              <Plus size={15} aria-hidden="true" />
              Thêm
            </button>
          </div>
          {keywordError && (
            <p id={`${id}-keyword-error`} className={styles.keywordError} role="alert">
              {keywordError}
            </p>
          )}
          {customKeywords.length > 0 && (
            <ul className={styles.keywordList} aria-label="Từ khóa đã thêm">
              {customKeywords.map((keyword) => (
                <li key={keyword}>
                  <button
                    type="button"
                    className={styles.keywordChip}
                    aria-label={`Xóa từ khóa: ${keyword}`}
                    onClick={() => {
                      update(
                        "custom_keywords",
                        customKeywords.filter((value) => value !== keyword),
                      );
                      setKeywordError("");
                    }}
                  >
                    <span>{keyword}</span>
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.keywordCount} role="status" aria-live="polite" aria-atomic="true">
            {customKeywords.length}/{MAX_CUSTOM_KEYWORDS} từ khóa đã thêm
          </p>
        </SettingSection>
      </fieldset>

      <footer className={styles.footer}>
        <p>
          {isRendering
            ? "Bạn có thể điều chỉnh thông số sau khi dựng xong."
            : canGenerate
              ? "Sẵn sàng tạo prompt và render ảnh."
              : "Thêm ảnh hiện trạng để bắt đầu."}
        </p>
      </footer>
    </aside>
  );
}
