with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('"Bearer test-placeholder-key"', 'f"Bearer {TEST_ENV[\'OPENAI_API_KEY\']}"')

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)

with open("backend/services/providers/openai_provider.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('except asyncio.TimeoutError:\n            raise HTTPException(504, "Quá thời gian.")', 'except (asyncio.TimeoutError, httpx.TimeoutException):\n            raise HTTPException(504, "Quá thời gian.")\n        except httpx.RequestError:\n            raise HTTPException(502, "Lỗi kết nối.")')

with open("backend/services/providers/openai_provider.py", "w", encoding="utf-8") as f:
    f.write(text)
