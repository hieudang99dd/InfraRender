import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, LIGHTING_VALUES, WEATHER_VALUES } from "./render-settings.ts";
import { QUICK_SETTINGS } from "./quick-settings.ts";

test("Bảo toàn apply and matches correctly", () => {
  const preset = QUICK_SETTINGS.find((q) => q.id === "bao_toan");
  const initial = { ...DEFAULT_SETTINGS, weather: WEATHER_VALUES.night };
  const applied = preset.apply(initial);

  assert.equal(applied.weather, WEATHER_VALUES.night);
  assert.equal(applied.preserve_geometry, true);
  assert.equal(applied.preserve_road_markings, true);
  assert.equal(applied.camera, "preserve the original camera perspective");
  assert.equal(applied.creativity, 5);
  assert.equal(preset.matches(applied), true);
});

test("Cân bằng apply and matches correctly", () => {
  const preset = QUICK_SETTINGS.find((q) => q.id === "can_bang");
  const initial = { ...DEFAULT_SETTINGS, camera: "test-camera", weather: "test-weather" };
  const applied = preset.apply(initial);

  assert.equal(applied.camera, "test-camera");
  assert.equal(applied.weather, "test-weather");
  assert.equal(applied.creativity, 30);
  assert.equal(applied.preserve_geometry, true);
  assert.equal(preset.matches(applied), true);
});

test("Cảnh quan apply and matches correctly", () => {
  const preset = QUICK_SETTINGS.find((q) => q.id === "canh_quan");
  const initial = { ...DEFAULT_SETTINGS, lighting: LIGHTING_VALUES.golden };
  const applied = preset.apply(initial);

  assert.equal(applied.vegetation, "urban landscape planting");
  assert.equal(applied.vegetation_density, "moderate");
  assert.equal(applied.lighting, LIGHTING_VALUES.golden);
  assert.equal(preset.matches(applied), true);

  const preview = preset.getPreview(applied);
  assert.ok(!preview.join(" ").includes("weather"));
});

test("Hạ tầng apply and matches correctly", () => {
  const preset = QUICK_SETTINGS.find((q) => q.id === "ha_tang");

  // Test when roads is provided
  const initialWithRoads = { ...DEFAULT_SETTINGS, roads: "concrete road surface" };
  const appliedWithRoads = preset.apply(initialWithRoads);
  assert.equal(appliedWithRoads.roads, "concrete road surface");
  assert.equal(appliedWithRoads.preserve_road_markings, true);
  assert.equal(appliedWithRoads.creativity, 20);
  assert.equal(appliedWithRoads.style, "clean professional architectural presentation");
  assert.equal(preset.matches(appliedWithRoads), true);

  const previewWithRoads = preset.getPreview(appliedWithRoads);
  assert.ok(previewWithRoads.includes("• Giữ mặt đường hiện tại"));
  assert.ok(!previewWithRoads.includes("Asphalt"));

  // Test when roads is empty
  const initialEmpty = { ...DEFAULT_SETTINGS };
  const appliedEmpty = preset.apply(initialEmpty);
  assert.equal(appliedEmpty.roads, "asphalt road surface");

  const previewEmpty = preset.getPreview(initialEmpty);
  assert.ok(previewEmpty.includes("• Mặt đường: Asphalt nếu chưa chọn"));
});

test("Chân thực apply and matches correctly", () => {
  const preset = QUICK_SETTINGS.find((q) => q.id === "chan_thuc");

  // Test when empty
  const initialEmpty = { ...DEFAULT_SETTINGS };
  const appliedEmpty = preset.apply(initialEmpty);
  assert.equal(appliedEmpty.style, "photorealistic visualization");
  assert.equal(appliedEmpty.lighting, LIGHTING_VALUES.natural);
  assert.equal(appliedEmpty.camera, "preserve the original camera perspective");
  assert.equal(appliedEmpty.creativity, 20);
  assert.equal(preset.matches(appliedEmpty), true);

  // Test when already has values
  const initialFull = {
    ...DEFAULT_SETTINGS,
    lighting: "custom-lighting",
    camera: "custom-camera",
    creativity: 80,
    weather: "custom-weather",
  };
  const appliedFull = preset.apply(initialFull);
  assert.equal(appliedFull.lighting, "custom-lighting");
  assert.equal(appliedFull.camera, "custom-camera");
  assert.equal(appliedFull.creativity, 80);
  assert.equal(appliedFull.weather, "custom-weather");

  const previewFull = preset.getPreview(initialFull);
  assert.ok(previewFull.includes("• Giữ ánh sáng hiện tại"));
  assert.ok(previewFull.includes("• Giữ góc nhìn hiện tại"));
  assert.ok(previewFull.includes("• Giữ sáng tạo hiện tại: 80%"));
});
