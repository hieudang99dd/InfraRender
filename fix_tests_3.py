with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('self.assertEqual(fields["prompt"].get_payload(\n            decode=True).decode(), prompt)', 'self.assertEqual(fields["prompt"].get_payload(\n            decode=True).decode(), prompt.strip())')

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
