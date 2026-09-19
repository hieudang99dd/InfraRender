# Production secrets

Create these files on the production server (they are Git-ignored):

```text
secrets/openai_api_key.txt
secrets/infrarender_auth_pass.txt
```

- `secrets/openai_api_key.txt` — the OpenAI API key only.
- `secrets/infrarender_auth_pass.txt` — the application access password used by
  FastAPI Basic auth (at least 12 characters in production). It is separate from
  the provider key and is what users enter in the app login screen.

Do not commit these files to Git. Docker Compose mounts them read-only into the
backend as Docker secrets and sets `OPENAI_API_KEY_FILE=/run/secrets/openai_api_key`
and `INFRARENDER_AUTH_PASS_FILE=/run/secrets/infrarender_auth_pass`.
