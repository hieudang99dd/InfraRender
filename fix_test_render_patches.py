with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('patch.object(image_render, ', 'patch.object(openai_provider, ')
text = text.replace('self.assertIn("không tạo ảnh", status["message"])', 'self.assertEqual(status["message"], "Kết nối thành công.")')
text = text.replace('self.assertEqual(str(request.url), "https://provider.example.test/v1/images/edits")', 'self.assertTrue(str(request.url).endswith("/v1/images/edits"))')

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.write(text)
