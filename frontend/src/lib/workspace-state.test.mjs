import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "./render-settings.ts";
import { normalizeWorkspace, emptyWorkspace, restoreRender } from "./workspace-state.ts";

const source = {
  saved_name: "a".repeat(32) + ".png",
  url: "https://old.example/uploads/a.png",
  name: "Ảnh gốc.png",
  size: "1 MB",
  resolution: "800 × 600",
};
test("workspace reload preserves source, full render snapshot and active selection", () => {
  const data = emptyWorkspace(DEFAULT_SETTINGS);
  data.source = source;
  data.renderVersions = [
    {
      id: "one",
      createdAt: new Date().toISOString(),
      name: "b".repeat(32) + ".png",
      url: "https://old.example/out.png",
      width: 800,
      height: 600,
      prompt: "Tiếng Việt",
      negativePrompt: "",
      settings: DEFAULT_SETTINGS,
      notes: "",
      projectName: "Dự án",
      provider: "OpenAI",
      model: "gpt-image-2",
      source,
    },
  ];
  data.activeRenderId = "one";
  const loaded = normalizeWorkspace(
    JSON.parse(JSON.stringify(data)),
    DEFAULT_SETTINGS,
    "https://api.example",
  );
  assert.equal(loaded.source.saved_name, source.saved_name);
  assert.equal(
    loaded.renderVersions[0].source.url,
    "https://api.example/uploads/" + source.saved_name,
  );
  assert.equal(loaded.activeRenderId, "one");
});
test("malformed stored values cannot corrupt settings or history", () => {
  const result = normalizeWorkspace(
    {
      settings: { creativity: "bad", custom_keywords: [3], weather: 2 },
      versions: [null, {}],
      renderVersions: [{}],
      source: { saved_name: "../.env" },
    },
    DEFAULT_SETTINGS,
    "https://api.example",
  );
  assert.deepEqual(result.settings, DEFAULT_SETTINGS);
  assert.deepEqual(result.versions, []);
  assert.deepEqual(result.renderVersions, []);
  assert.equal(result.source, null);
});
test("render restore changes the original image with its settings and prompt", () => {
  const state = emptyWorkspace(DEFAULT_SETTINGS);
  const version = {
    id: "one",
    source,
    prompt: "Khôi phục",
    negativePrompt: "biển",
    notes: "cây",
    settings: { ...DEFAULT_SETTINGS, weather: "sunny" },
  };
  const next = restoreRender(state, version);
  assert.equal(next.source.saved_name, source.saved_name);
  assert.equal(next.prompt, version.prompt);
  assert.equal(next.settings.weather, "sunny");
  assert.equal(next.activeRenderId, "one");
  assert.equal(restoreRender(state, { ...version, source: undefined }).source, null);
});
