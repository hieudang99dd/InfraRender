import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, getBackendUrl, uploadImage, requestRender } from "./api.ts";

test("API rejects absolute URLs so access tokens cannot leave the backend", async () => {
  await assert.rejects(apiRequest("https://untrusted.example/api/projects"), /đường dẫn API/i);
});

test("API errors retain status for conflict handling", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "Conflict" }, { status: 409 }),
  );
  await assert.rejects(apiRequest("/api/projects/a"), (error) => error.status === 409);
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
      model: "gpt-image-2",
    });
  });
  const result = await requestRender(
    {
      reference_image_name: "street.png",
      prompt: "My edited scene.",
      negative_prompt: "No billboards.",
      settings: {},
    },
    new AbortController().signal,
  );
  assert.equal(result.url, "/outputs/test.png");
});

test("render configuration failure is readable and does not retry", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "Cha cu hAnh d<ch v render." }, { status: 503 }),
  );
  await assert.rejects(
    requestRender(
      { reference_image_name: "test.png", prompt: "Scene", settings: {} },
      new AbortController().signal,
    ),
    /Cha cu hAnh d<ch v render/,
  );
  assert.equal(mock.mock.callCount(), 1);
});

function withBackendUrl(value, fn) {
  const key = "NEXT_PUBLIC_INFRARENDER_API_URL";
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

function withWindow(hostname, origin, fn) {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname, origin } };
  try {
    return fn();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("deployment URL: GitHub Pages build uses the configured HTTPS backend", () => {
  withBackendUrl("https://api.example.test/", () => {
    assert.equal(getBackendUrl(), "https://api.example.test");
  });
});

test("deployment URL: local development without config points at the local backend", () => {
  withBackendUrl(undefined, () => {
    const local = withWindow("localhost", "http://localhost:3000", () => getBackendUrl());
    assert.equal(local, "http://127.0.0.1:8000");
  });
});

test("deployment URL: self-hosted build uses the current site origin (same-origin API)", () => {
  withBackendUrl(undefined, () => {
    const origin = withWindow("render.example.com", "https://render.example.com", () =>
      getBackendUrl(),
    );
    assert.equal(origin, "https://render.example.com");
  });
});

test("deployment URL: without a browser window the local backend fallback is used", () => {
  withBackendUrl(undefined, () => {
    assert.equal(getBackendUrl(), "http://127.0.0.1:8000");
  });
});

test("deployment URL: access token scope follows the resolved backend URL", () => {
  withBackendUrl(undefined, () => {
    assert.equal(
      withWindow("localhost", "http://localhost:3000", () => getBackendUrl()),
      "http://127.0.0.1:8000",
    );
    assert.equal(
      withWindow("studio.example.com", "https://studio.example.com", () => getBackendUrl()),
      "https://studio.example.com",
    );
  });
});
