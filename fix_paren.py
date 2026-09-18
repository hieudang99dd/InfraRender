with open('backend/tests/test_api.py', 'r', encoding='utf-8') as f:
    text = f.read()
text = text.replace('self.assertTrue(len(response.json()["prompt"]) > 0))', 'self.assertTrue(len(response.json()["prompt"]) > 0)')
with open('backend/tests/test_api.py', 'w', encoding='utf-8') as f:
    f.write(text)
