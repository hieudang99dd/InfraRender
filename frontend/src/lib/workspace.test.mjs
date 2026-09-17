import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "./render-settings.ts";
import { promptSignature } from "./workspace.ts";

test("restored snapshots remain current only for their original source and settings", () => {
  const original = promptSignature(DEFAULT_SETTINGS, "Keep the bridge", "blob:source-one");
  assert.equal(
    original,
    promptSignature({ ...DEFAULT_SETTINGS }, "Keep the bridge", "blob:source-one"),
  );
  assert.notEqual(
    original,
    promptSignature(DEFAULT_SETTINGS, "Keep the bridge", "blob:source-two"),
  );
  assert.notEqual(original, promptSignature(DEFAULT_SETTINGS, "Add a bridge", "blob:source-one"));
  assert.notEqual(
    original,
    promptSignature(
      { ...DEFAULT_SETTINGS, preserve_geometry: false },
      "Keep the bridge",
      "blob:source-one",
    ),
  );
});

test("a removed source invalidates a previously generated prompt signature", () => {
  assert.notEqual(
    promptSignature(DEFAULT_SETTINGS, "", "blob:source"),
    promptSignature(DEFAULT_SETTINGS, "", null),
  );
});
