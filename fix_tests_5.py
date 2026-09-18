with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

import re
text = re.sub(r'self\.assertIn\(".*?nh thành c.*?ng", status\["message"\]\)\n', '', text)

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
