import re
from pathlib import Path

path = Path('backend/tests/test_render.py')
content = path.read_text('utf-8')

# Change /api/render-image requests to use JSON and not files
content = re.sub(r'data=\{\s*"prompt": ([^}]+)\s*\},\s*files=files', r'json={"prompt": \1, "reference_image_name": "source.png", "settings": {}}', content)
content = re.sub(r'data=\{\s*"prompt": ([^}]+),\s*"negative_prompt": ([^}]+)\s*\},\s*files=files', r'json={"prompt": \1, "negative_prompt": \2, "reference_image_name": "source.png", "settings": {}}', content)

# There are some explicit ones
content = content.replace('data={"prompt": "Vườn nhiệt đới"}, files=files', 'json={"prompt": "Vườn nhiệt đới", "reference_image_name": "source.png", "settings": {}}')
content = content.replace('data={"prompt": ""}, files=files', 'json={"prompt": "", "reference_image_name": "source.png", "settings": {}}')
content = content.replace('data={"prompt": "A" * 28001}, files=files', 'json={"prompt": "A" * 28001, "reference_image_name": "source.png", "settings": {}}')
content = content.replace('data={"prompt": "Cảnh quan", "negative_prompt": "B" * 4001}, files=files', 'json={"prompt": "Cảnh quan", "negative_prompt": "B" * 4001, "reference_image_name": "source.png", "settings": {}}')
content = content.replace('files=files, data={"prompt": ""}', 'json={"prompt": "", "reference_image_name": "source.png", "settings": {}}')
content = content.replace('files=files, data={"prompt": "A" * 28001}', 'json={"prompt": "A" * 28001, "reference_image_name": "source.png", "settings": {}}')
content = content.replace('files=files, data={"prompt": "Cảnh quan", "negative_prompt": "B" * 4001}', 'json={"prompt": "Cảnh quan", "negative_prompt": "B" * 4001, "reference_image_name": "source.png", "settings": {}}')


# We also need to mock UPLOAD_DIR to have source.png
test_setup = "    def setUp(self):\n        import main\n        self.upload_dir = Path(tempfile.mkdtemp())\n        (self.upload_dir / 'source.png').write_bytes(image_bytes())\n        self.upload_patch = patch.object(main, 'UPLOAD_DIR', self.upload_dir)\n        self.upload_patch.start()\n        self.addCleanup(self.upload_patch.stop)\n        self.addCleanup(lambda: __import__('shutil').rmtree(self.upload_dir))"

content = content.replace('def setUp(self):', test_setup.replace('"', ''))

path.write_text(content, 'utf-8')
