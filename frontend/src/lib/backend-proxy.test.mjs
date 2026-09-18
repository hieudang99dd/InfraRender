import assert from "node:assert/strict";
import { test } from "node:test";
import { backendBaseUrl, proxyBackend, resetRateLimitsForTests } from "./backend-proxy.ts";

function setup(context, url = "http://127.0.0.1:8000") {
  const previous = process.env.INFRARENDER_API_URL;
  process.env.INFRARENDER_API_URL = url;
  context.after(() => {
    if (previous === undefined) delete process.env.INFRARENDER_API_URL;
    else process.env.INFRARENDER_API_URL = previous;
  });
}

test("proxy keeps backend configuration on the server and preserves a deployment prefix", (context) => {
  setup(context, "http://127.0.0.1:8000/studio/");
  assert.equal(backendBaseUrl(), "http://127.0.0.1:8000/studio");
});

test("proxy forwards JSON choices and never forwards browser credentials", async (context) => {
  setup(context);
  const body = JSON.stringify({ custom_keywords: ["phố đi bộ", "chợ nổi"] });
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8000/api/generate-prompt");
    assert.equal(new TextDecoder().decode(options.body), body);
    assert.equal(options.headers.get("content-type"), "application/json");
    assert.equal(options.headers.get("cookie"), null);
    assert.equal(options.headers.get("authorization"), null);
    assert.equal(options.redirect, "error");
    return Response.json({ prompt: "Custom context: phố đi bộ, chợ nổi." });
  });
  const result = await proxyBackend(
    new Request("https://studio.example/api/generate-prompt", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        Cookie: "private=value",
        Authorization: "secret",
      },
    }),
    ["generate-prompt"],
  );
  assert.match((await result.json()).prompt, /phố đi bộ/);
});

test("proxy preserves multipart reference image and rewrites media URLs to same origin", async (context) => {
  setup(context, "http://127.0.0.1:8000/studio");
  const body = new FormData();
  body.append("file", new File(["source bytes"], "source.png", { type: "image/png" }));
  body.append("prompt", "My edited scene");
  context.mock.method(globalThis, "fetch", async (url, options) => {
    const decoded = await new Request(url, options).formData();
    assert.equal(await decoded.get("file").text(), "source bytes");
    assert.equal(decoded.get("prompt"), "My edited scene");
    return Response.json({
      status: "success",
      url: "http://127.0.0.1:8000/studio/outputs/result.png",
    });
  });
  const response = await proxyBackend(
    new Request("https://studio.example/api/render-image", { method: "POST", body }),
    ["render-image"],
  );
  assert.equal((await response.json()).url, "/api/files/outputs/result.png");
});

test("media proxy streams images through the app origin", async (context) => {
  setup(context);
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "http://127.0.0.1:8000/uploads/ref.png");
    return new Response("png bytes", { headers: { "Content-Type": "image/png" } });
  });
  const response = await proxyBackend(
    new Request("https://studio.example/api/files/uploads/ref.png"),
    ["files", "uploads", "ref.png"],
  );
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(await response.text(), "png bytes");
});

test("unavailable backend explains how to start services and never retries", async (context) => {
  setup(context);
  const mock = context.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("private network details");
  });
  const response = await proxyBackend(new Request("http://localhost:3000/api/health"), ["health"]);
  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /start.cmd/);
  assert.equal(mock.mock.callCount(), 1);
});

test("aborting a stalled upload cancels its stream promptly without contacting the backend", async (context) => {
  setup(context);
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(new TextEncoder().encode("partial request"));
    },
    cancel() {
      cancelled = true;
      // A source that cannot finish cleanup must not keep the proxy hanging.
      return new Promise(() => {});
    },
  });
  const mock = context.mock.method(globalThis, "fetch", () => {
    throw new Error("must not contact backend after abort");
  });
  const request = new Request("http://localhost:3000/api/upload-image", {
    method: "POST",
    body,
    duplex: "half",
    signal: controller.signal,
  });
  const pending = proxyBackend(request, ["upload-image"]);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("proxy remained pending after abort")), 500);
  });
  context.after(() => clearTimeout(timer));
  const response = await Promise.race([pending, deadline]);
  assert.equal(response.status, 504);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
  assert.equal(mock.mock.callCount(), 0);
});

test("unknown paths, wrong methods, self proxies and oversized bodies never call backend", async (context) => {
  setup(context);
  const mock = context.mock.method(globalThis, "fetch", () => {
    throw new Error("must not fetch");
  });
  const unknown = await proxyBackend(new Request("http://localhost:3000/api/secrets"), [
    "files",
    "..",
    "secrets",
  ]);
  assert.equal(unknown.status, 404);
  const wrongMethod = await proxyBackend(new Request("http://localhost:3000/api/render-image"), [
    "render-image",
  ]);
  assert.equal(wrongMethod.status, 405);
  const huge = await proxyBackend(
    new Request("http://localhost:3000/api/upload-image", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(22 * 1024 * 1024) },
    }),
    ["upload-image"],
  );
  assert.equal(huge.status, 413);
  process.env.INFRARENDER_API_URL = "http://localhost:3000";
  const loop = await proxyBackend(new Request("http://localhost:3000/api/health"), ["health"]);
  assert.equal(loop.status, 503);
  assert.equal(mock.mock.callCount(), 0);
});

test("proxy preserves API validation errors and sanitizes non-JSON responses", async (context) => {
  setup(context);
  const mock = context.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "Ảnh bị hỏng." }, { status: 400 }),
  );
  const request = () =>
    new Request("http://localhost:3000/api/upload-image", { method: "POST", body: "invalid" });
  const invalid = await proxyBackend(request(), ["upload-image"]);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).detail, "Ảnh bị hỏng.");
  mock.mock.mockImplementation(async () => new Response("internal credentials", { status: 502 }));
  const bad = await proxyBackend(request(), ["upload-image"]);
  assert.equal(bad.status, 502);
  assert.doesNotMatch(await bad.text(), /credentials/);
});


test("proxy rate limits repeated render requests by client address", async (context) => {
  setup(context);
  resetRateLimitsForTests();
  context.after(() => resetRateLimitsForTests());
  const mock = context.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "success",
      url: "/outputs/result.png",
      name: "result.png",
      width: 1024,
      height: 1024,
      provider: "OpenAI Images",
      model: "gpt-image-2",
    }),
  );

  const body = JSON.stringify({
    prompt: "Scene",
    negative_prompt: "",
    reference_image_name: "ref.png",
    settings: {},
    project_name: "Test",
  });

  for (let index = 0; index < 12; index += 1) {
    const response = await proxyBackend(
      new Request("https://studio.example/api/render-image", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.10",
        },
      }),
      ["render-image"],
    );
    assert.equal(response.status, 200);
  }

  const limited = await proxyBackend(
    new Request("https://studio.example/api/render-image", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.10",
      },
    }),
    ["render-image"],
  );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(mock.mock.callCount(), 12);
});
