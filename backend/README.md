# InfraRender API

FastAPI provides reference-image uploads, deterministic visualization prompts, and
image rendering through a configured OpenAI Images API. Creating a prompt does not
send an image-generation request; rendering is a separate explicit action.

## Run locally

Python 3.11 or newer is required (the render service uses `asyncio.timeout`).

From `backend` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API documentation: <http://127.0.0.1:8000/docs>.

To enable rendering, copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart
the backend. In the studio, choose **Kiểm tra kết nối** to verify API authentication
and model access without generating an image. The key stays on the server. Never put it in a `NEXT_PUBLIC_*` variable
or a frontend file. Without a key, uploads and prompt creation still work, while
render requests return HTTP 503 with a configuration message.

Optional environment variables, set before starting the server:

| Variable                      | Default                                       | Purpose                                                                         |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `INFRARENDER_CORS_ORIGINS`    | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated frontend origins.                                               |
| `INFRARENDER_PUBLIC_BASE_URL` | Request base URL                              | Public API URL for uploaded image links, including a deployment path if needed. |
| `OPENAI_API_KEY` | Empty | Server-side API key required for image rendering. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Image-editing model available to your provider account. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Server-configured API base URL. An alternative service must support the same Images edit request and base64 PNG response contract. |

The backend loads `.env` without overriding environment variables already set by
the process. A configured key alone reports `unverified`, not a successful connection.
Missing or example keys and invalid key/model/base-URL formats produce actionable
configuration messages. The connection check retrieves model metadata; it does not
guarantee image-generation permissions or available credit. Those are checked when
the provider receives a render request. Restart the backend after changing `.env`.

## Endpoints

- `GET /api/health`: service status and capabilities. `image_generation` reflects valid local renderer configuration; `renderer` contains the detailed connection status below. A healthy backend can still have no image-provider credentials.
- `GET /api/render-status`: `{ "configured": boolean, "provider": "OpenAI Images", "state": "...", "message": "...", "checked_at": null | "ISO-8601 UTC timestamp" }`. This performs no external request and exposes no credentials or configured provider URL.
- `POST /api/render-status/check`: no body required; explicitly requests `GET /models/{model}` from the configured provider and returns the same status shape. It sends no image/prompt and never calls the image-generation endpoint. Each action makes one request, does not follow redirects, and has a 15-second timeout. A supported model-metadata API is required for this diagnostic; a provider that supports only image edits may still render despite a failed diagnostic.
- `POST /api/upload-image`: multipart field `file`; JPG/JPEG, PNG or WEBP, at most 20 MiB and 40 million pixels. Validates image contents and metadata before saving. Returns the existing upload fields plus `width`, `height`, and verified `content_type`.
- `POST /api/generate-prompt`: JSON settings; returns `{ "status": "success", "prompt": "..." }`.
- `POST /api/render-image`: multipart fields `file`, `prompt`, and optional `negative_prompt`; returns `{ "status": "success", "url": "...", "name": "...png", "width": number, "height": number }`.

Renderer states are `missing_key`, `invalid_config`, `unverified`, `connected`,
`unauthorized`, `model_unavailable`, `rate_limited`, `unreachable`, `timeout`, and
`provider_error`. `configured` always describes local configuration, even if a
connection check fails. Diagnostic results use HTTP 200 with this state; provider
errors are sanitized. `checked_at` is null until a check/render records an outcome.
The latest result is held in server memory for five minutes; changed configuration,
expiration, and server restarts return to `unverified`. An explicit check always
issues a new model request. Successful renders and provider authentication,
availability, quota, or transport errors also refresh this status. Request-specific
render input errors do not overwrite it. With multiple backend workers, each worker
keeps its own snapshot.

Prompt settings retain all previous optional string fields: `infrastructure`, `roads`,
`buildings`, `vehicles`, `vegetation`, `weather`, `lighting`, `materials`, `camera`,
`style`, and `notes`. The independent optional fields `buildings_density`,
`vehicles_density`, and `vegetation_density` specify density without requiring an
object type. Text fields are trimmed and limited to 2,000 characters; notes allow
5,000 characters. An empty or null density is unset; an explicit value such as
`none` is preserved.

| Setting                  | Default | Accepted values                                             |
| ------------------------ | ------- | ----------------------------------------------------------- |
| `preserve_geometry`      | Unset | Boolean or `null` |
| `preserve_road_markings` | Unset | Boolean or `null` |
| `creativity`             | Unset | Integer, 0–100, or `null` |
| `quality`                | Unset | `Original`, `1K`, `2K`, `4K`, `8K`, or `null` |
| `aspect_ratio`           | Unset | `Original`, a positive integer ratio such as `4:3`, or `null` |

Generated prompts use Vietnamese for instructions, section labels, and every
built-in scene choice, including density, preservation, camera, and output settings.
English preset identifiers remain accepted for compatibility with saved settings;
they are translated only when they match a recognized choice in that field.
Custom keywords, notes, and unknown free-text values retain the user's wording and
language after the existing whitespace/Unicode normalization. Rendering still
forwards the user's currently edited prompt without translating or rebuilding it.

All settings start unset. An empty request produces only the neutral instruction
`Tạo ảnh phối cảnh dựa trên ảnh tham chiếu được cung cấp.` The prompt builder adds only
explicit choices: no default camera, preservation, materials, lighting, vegetation,
style, creativity, or output resolution. Empty output-setting strings are also
treated as unset.

## Rendering behavior

The renderer forwards the actual validated source image and the current edited
prompt to `/images/edits`, using multipart `image[]`, the configured model, `n=1`,
and `output_format=png`. It does not rebuild the prompt or reapply settings. A
nonempty negative prompt is appended under `Avoid:`. Prompt text is otherwise
unchanged. The limits are 28,000 prompt characters, 4,000 negative-prompt characters,
and 32,000 characters for the combined text including the separator.

Quality and aspect ratio, when chosen, are conveyed in the prompt. No implicit
provider `size` or `quality` parameter is applied; requested dimensions in text
are not guaranteed. Returned images must be valid PNGs no larger than 32 MiB and
40 million pixels. The provider response is bounded before JSON/base64 decoding.
Only validated results are saved under `outputs/` with generated filenames.

Each render action makes one provider request, with a 180-second timeout and no
automatic retries. Provider errors are sanitized before reaching the browser.
Cancelling or timing out a client request does not guarantee that a provider has
cancelled its work or avoided charges. The tests never call the paid API.

The integration follows the official OpenAI [Images edit reference](https://developers.openai.com/api/reference/resources/images/methods/edit),
[image-generation guide](https://developers.openai.com/api/docs/guides/image-generation), and
[model-retrieval reference](https://developers.openai.com/api/reference/typescript/resources/models/methods/retrieve).

Uploaded files are stored in `uploads/` and served by the API. The existing
`outputs/` static route serves generated results. Neither directory is cleared
automatically. Removing an image from the browser workspace does not delete its
server file; no public deletion endpoint is provided. The local service has no
authentication; add access control before exposing paid rendering publicly.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests cover supported image formats, corruption and format spoofing, size and pixel
limits, bounded reads, upload stream closure, storage failures, generated URLs,
prompt compatibility, unset and explicit controls, and request validation. Renderer
tests use an HTTP mock to inspect the real multipart payload and exercise success,
missing/invalid configuration, model-only connection checks, cached status expiry
and configuration changes, sanitized provider errors, timeouts, corrupt or oversized
results, storage failures, and upload closure. Tests use temporary directories and do not
modify the user's uploads or outputs.
