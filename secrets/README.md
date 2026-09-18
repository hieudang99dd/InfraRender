# Production secrets

Create this file on the production server:

```text
secrets/openai_api_key.txt
```

Put only the OpenAI API key in that file. Do not commit it to Git.

Production Compose mounts it read-only into the backend as a Docker secret and sets
`OPENAI_API_KEY_FILE=/run/secrets/openai_api_key`.
