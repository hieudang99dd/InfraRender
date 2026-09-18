import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, uploadImage, requestRender } from "./api.ts";

test("API rejects absolute URLs so access tokens cannot leave the backend", async () => {
  await assert.rejects(apiRequest("https://untrusted.example/api/projects"), /đường dẫn API/i);
});

test("API errors retain status for conflict handling", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Conflict" }, {status:409}));
  await assert.rejects(apiRequest("/api/projects/a"), error => error.status === 409);
});

test("API requests preserve caller payload and propagate successful JSON", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/api\/generate-prompt$/);
    assert.equal(options.cache, "no-store");
    assert.equal(options.method, "POST");
    assert.equal(options.body, '{"notes":"test"}');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ status: "success", prompt: "Reference-based scene." });
  });
  const result = await apiRequest("/api/generate-prompt", {
    method: "POST",
    body: '{"notes":"test"}',
    signal: controller.signal,
  });
  assert.equal(result.prompt, "Reference-based scene.");
});

test("API validation errors present a readable server message", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "File Ã¡ÂºÂ£nh bÃ¡Â»â€¹ hÃ¡Â»Âng." }, { status: 400 }),
  );
  await assert.rejects(apiRequest("/api/upload-image"), /File Ã¡ÂºÂ£nh bÃ¡Â»â€¹ hÃ¡Â»Âng/);
});

test("structured validation errors use a readable fallback", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: [{ msg: "bad field" }] }, { status: 422 }),
  );
  await assert.rejects(apiRequest("/api/generate-prompt"), /Yêu cầu chưa thành công/);
});

test("non-JSON server failures do not leak a JSON parsing exception", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Gateway unavailable", { status: 502 }),
  );
  await assert.rejects(apiRequest("/api/health"), /Yêu cầu chưa thành công/);
});

test("network failures explain that the service cannot be reached", async (context) => {
  context.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(apiRequest("/api/health"), /Không thể kết nối dịch vụ/);
});

test("cancelled requests preserve cancellation instead of becoming network errors", async (context) => {
  const controller = new AbortController();
  controller.abort();
  context.mock.method(globalThis, "fetch", async () => {
    throw controller.signal.reason;
  });
  await assert.rejects(
    apiRequest("/api/health", { signal: controller.signal }),
    (error) => error.name === "AbortError",
  );
});

test("uploads send the original File as multipart data without overriding its boundary", async (context) => {
  const file = new File(["image bytes"], "bridge.png", { type: "image/png" });
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get("file").name, file.name);
    assert.equal(options.headers, undefined);
    assert.equal(await options.body.get("file").text(), "image bytes");
    return Response.json({ status: "success", url: "/uploads/bridge.png" });
  });
  assert.equal((await uploadImage(file, new AbortController().signal)).status, "success");
});

test("render sends the reference and edited prompts without reapplying settings", async (context) => {
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/api\/render-image$/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    const body = JSON.parse(options.body);
    assert.equal(body.reference_image_name, "street.png");
    assert.equal(body.prompt, "My edited scene.");
    assert.equal(body.negative_prompt, "No billboards.");
    return Response.json({
      status: "success",
      url: "/outputs/test.png",
      name: "test.png",
      width: 1024,
      height: 1024,
      provider: "OpenAI",
      model: "gpt-image-2"
    });
  });
  const result = await requestRender(
    { reference_image_name: "street.png", prompt: "My edited scene.", negative_prompt: "No billboards.", settings: {} },
    new AbortController().signal,
  );
  assert.equal(result.url, "/outputs/test.png");
});

test("render configuration failure is readable and does not retry", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "Cha cu hAnh d<ch v render." }, { status: 503 }),
  );
  await assert.rejects(
    requestRender({ reference_image_name: "test.png", prompt: "Scene", settings: {} }, new AbortController().signal),
    /Cha cu hAnh d<ch v render/,
  );
  assert.equal(mock.mock.callCount(), 1);
});

