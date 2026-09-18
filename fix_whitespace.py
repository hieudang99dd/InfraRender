import re

with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

# Fix indentation by replacing trailing spaces/tabs on empty lines with just a newline
text = re.sub(r'^[ \t]+$', '', text, flags=re.MULTILINE)

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
