with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('upload_resp.json()["filename"]', 'upload_resp.json()["saved_name"]')

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
