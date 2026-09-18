with open("backend/services/providers/openai_provider.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '# Tag the metadata with provider info\n            result_meta.provider = PROVIDER_NAME\n            result_meta.model = config.model\n            return content, result_meta',
    'return content, result_meta, PROVIDER_NAME, config.model'
)

with open("backend/services/providers/openai_provider.py", "w", encoding="utf-8") as f:
    f.write(text)

with open("backend/services/providers/base.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    ') -> tuple[bytes, ImageMetadata]:',
    ') -> tuple[bytes, ImageMetadata, str, str]:'
)

with open("backend/services/providers/base.py", "w", encoding="utf-8") as f:
    f.write(text)

with open("backend/main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    'result, result_metadata = await render_image(',
    'result, result_metadata, provider_name, model_name = await render_image('
)

text = text.replace(
    'provider="OpenAI Images", # TODO: Get from provider',
    'provider=provider_name,'
)
text = text.replace(
    'model="gpt-image-2",',
    'model=model_name,'
)

with open("backend/main.py", "w", encoding="utf-8") as f:
    f.write(text)
