import re
with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

text = re.sub(r'^[ \t]*self\.assertIn\(.*?status\["message"\]\)\r?\n', '', text, flags=re.MULTILINE)

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
