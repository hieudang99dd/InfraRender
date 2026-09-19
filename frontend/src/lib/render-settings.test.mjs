import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  LIGHTING_VALUES,
  MAX_CUSTOM_KEYWORDS,
  MAX_CUSTOM_KEYWORD_LENGTH,
  WEATHER_VALUES,
  addCustomKeyword,
  toPromptRequest,
  updateRenderSetting,
  isDefaultRenderSettings,
  getOutputSummary,
} from "./render-settings.ts";

test("initial settings are all unset and add no assumptions to the prompt request", () => {
  assert.ok(
    Object.values(DEFAULT_SETTINGS).every(
      (value) => value === "" || value === null || (Array.isArray(value) && value.length === 0),
    ),
  );
  assert.deepEqual(toPromptRequest(DEFAULT_SETTINGS, "  A pedestrian crossing.  "), {
    notes: "A pedestrian crossing.",
  });
});

test("choosing weather leaves every other setting unchanged, including conflicting lighting", () => {
  const initial = Object.freeze({ ...DEFAULT_SETTINGS, lighting: LIGHTING_VALUES.golden });
  const next = updateRenderSetting(initial, "weather", WEATHER_VALUES.night);

  assert.deepEqual(next, { ...initial, weather: WEATHER_VALUES.night });
  assert.equal(initial.weather, "");
  assert.deepEqual(toPromptRequest(next, ""), {
    weather: WEATHER_VALUES.night,
    lighting: LIGHTING_VALUES.golden,
    notes: "",
  });
});

test("choosing lighting does not select or alter the weather", () => {
  for (const weather of ["", WEATHER_VALUES.sunny, WEATHER_VALUES.night]) {
    const initial = { ...DEFAULT_SETTINGS, weather };
    const next = updateRenderSetting(initial, "lighting", LIGHTING_VALUES.night);
    assert.deepEqual(next, { ...initial, lighting: LIGHTING_VALUES.night });
  }
});

test("clearing a selected setting omits only that field from the request", () => {
  const initial = {
    ...DEFAULT_SETTINGS,
    weather: WEATHER_VALUES.rain,
    lighting: LIGHTING_VALUES.soft,
  };
  const next = updateRenderSetting(initial, "weather", "");

  assert.deepEqual(toPromptRequest(next, ""), { lighting: LIGHTING_VALUES.soft, notes: "" });
});

test("density choices are independent from object types and from each other", () => {
  const initial = Object.freeze({
    ...DEFAULT_SETTINGS,
    buildings: "modern architecture",
    vegetation: "tropical vegetation",
    vehicles: "cars",
    buildings_density: "sparse",
    vegetation_density: "dense",
    vehicles_density: "moderate",
  });

  for (const key of ["buildings_density", "vegetation_density", "vehicles_density"]) {
    const next = updateRenderSetting(initial, key, "none");
    assert.deepEqual(next, { ...initial, [key]: "none" });
    const request = toPromptRequest(next, "");
    assert.equal(request[key], "none");
    assert.equal(request.buildings, initial.buildings);
    assert.equal(request.vegetation, initial.vegetation);
    assert.equal(request.vehicles, initial.vehicles);
  }
});

test("a density can be selected without introducing an object type", () => {
  const next = updateRenderSetting(DEFAULT_SETTINGS, "vehicles_density", "dense");
  assert.deepEqual(toPromptRequest(next, ""), { vehicles_density: "dense", notes: "" });
});

test("explicit false and zero values survive serialization while unset controls are omitted", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    preserve_geometry: false,
    preserve_road_markings: false,
    creativity: 0,
  };

  assert.deepEqual(toPromptRequest(settings, ""), {
    preserve_geometry: false,
    preserve_road_markings: false,
    creativity: 0,
    notes: "",
  });
  assert.deepEqual(toPromptRequest(updateRenderSetting(settings, "creativity", null), ""), {
    preserve_geometry: false,
    preserve_road_markings: false,
    notes: "",
  });
});

test("custom phrases retain Vietnamese and punctuation without altering other settings", () => {
  const initial = Object.freeze({
    ...DEFAULT_SETTINGS,
    weather: WEATHER_VALUES.mist,
    preserve_geometry: false,
    creativity: 0,
    custom_keywords: Object.freeze(["phố cổ Hội An"]),
  });
  const result = addCustomKeyword(initial.custom_keywords, "  đèn   lồng, cầu gỗ  ");
  assert.deepEqual(result, { keywords: ["phố cổ Hội An", "đèn lồng, cầu gỗ"] });
  assert.deepEqual(initial.custom_keywords, ["phố cổ Hội An"]);
  const next = updateRenderSetting(initial, "custom_keywords", result.keywords);
  assert.deepEqual(toPromptRequest(next, "  Giữ lối đi bộ.  "), {
    weather: WEATHER_VALUES.mist,
    preserve_geometry: false,
    creativity: 0,
    custom_keywords: ["phố cổ Hội An", "đèn lồng, cầu gỗ"],
    notes: "Giữ lối đi bộ.",
  });
});

test("keyword entry rejects empty text and equivalent Vietnamese duplicates", () => {
  assert.deepEqual(addCustomKeyword([], " \n\t "), { error: "empty" });
  assert.deepEqual(addCustomKeyword(["phố cổ Hội An"], " PHỐ  CỔ HỘI AN ".normalize("NFD")), {
    error: "duplicate",
  });
  assert.deepEqual(addCustomKeyword([], "  phố cổ\n Hội An  ".normalize("NFD")), {
    keywords: ["phố cổ Hội An"],
  });
});

test("keyword limits count Unicode characters and reject overflowing entries without truncation", () => {
  const fullList = Array.from({ length: MAX_CUSTOM_KEYWORDS }, (_, index) => `ý tưởng ${index}`);
  assert.deepEqual(addCustomKeyword(fullList, "ý tưởng mới"), { error: "limit" });
  assert.deepEqual(addCustomKeyword([], "x".repeat(MAX_CUSTOM_KEYWORD_LENGTH + 1)), {
    error: "too-long",
  });
  const unicodeBoundary = "🌳".repeat(MAX_CUSTOM_KEYWORD_LENGTH);
  assert.deepEqual(addCustomKeyword([], unicodeBoundary), { keywords: [unicodeBoundary] });
  assert.deepEqual(addCustomKeyword(fullList.slice(1), "ý tưởng mới"), {
    keywords: [...fullList.slice(1), "ý tưởng mới"],
  });
});

test("request normalization omits blank keywords and deduplicates while preserving order", () => {
  const initial = {
    ...DEFAULT_SETTINGS,
    custom_keywords: ["  phố cổ  ", " ", "PHỐ CỔ".normalize("NFD"), "ven sông"],
  };
  assert.deepEqual(toPromptRequest(initial, ""), {
    custom_keywords: ["phố cổ", "ven sông"],
    notes: "",
  });
  assert.deepEqual(toPromptRequest({ ...DEFAULT_SETTINGS, custom_keywords: ["  "] }, ""), {
    notes: "",
  });
  assert.deepEqual(toPromptRequest(updateRenderSetting(initial, "custom_keywords", []), ""), {
    notes: "",
  });
  assert.deepEqual(DEFAULT_SETTINGS.custom_keywords, []);
});

test("legacy state retained during hot reload still builds a request without keywords", () => {
  const legacySettings = { ...DEFAULT_SETTINGS, weather: WEATHER_VALUES.mist };
  delete legacySettings.custom_keywords;
  assert.deepEqual(toPromptRequest(legacySettings, ""), {
    weather: WEATHER_VALUES.mist,
    notes: "",
  });
});

test("isDefaultRenderSettings detects default vs custom", () => {
  assert.equal(isDefaultRenderSettings(DEFAULT_SETTINGS), true);
  assert.equal(isDefaultRenderSettings({ ...DEFAULT_SETTINGS }), true);
  assert.equal(isDefaultRenderSettings({ ...DEFAULT_SETTINGS, weather: WEATHER_VALUES.sunny }), false);
  assert.equal(isDefaultRenderSettings({ ...DEFAULT_SETTINGS, custom_keywords: ["hi"] }), false);
});

test("getOutputSummary formats correctly", () => {
  assert.equal(getOutputSummary({ ...DEFAULT_SETTINGS }), "Gốc · Tỷ lệ gốc");
  assert.equal(getOutputSummary({ ...DEFAULT_SETTINGS, quality: "Original", aspect_ratio: "Original" }), "Gốc · Tỷ lệ gốc");
  assert.equal(getOutputSummary({ ...DEFAULT_SETTINGS, quality: "4K", aspect_ratio: "16:9" }), "4K · 16:9");
  assert.equal(getOutputSummary({ ...DEFAULT_SETTINGS, quality: "2K" }), "2K · Tỷ lệ gốc");
});
