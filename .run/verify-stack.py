import io
import re
from pathlib import Path

import httpx
from PIL import Image

with httpx.Client(base_url='http://127.0.0.1:3000', timeout=30) as client:
    page = client.get('/')
    page.raise_for_status()
    assert 'Từ khóa tùy chỉnh' in page.text and 'Thiết lập bối cảnh' in page.text
    assert 'Ảnh gốc' in page.text and 'Ảnh Render' in page.text
    assert 'comparison-grid' in page.text
    print('PASS: workspace page renders custom keyword controls')
    health = client.get('/api/health')
    health.raise_for_status()
    assert health.json()['status'] == 'ok'
    print('PASS: frontend connects to backend through same origin')
    status = client.get('/api/render-status')
    status.raise_for_status()
    assert status.json()['state'] == 'missing_key'
    check = client.post('/api/render-status/check')
    check.raise_for_status()
    assert check.json()['state'] == 'missing_key'
    print('PASS: missing render key reported clearly; no provider call')
    custom = ['phố đi bộ ven sông', 'đèn lồng Hội An', 'vườn trên mái']
    prompt = client.post('/api/generate-prompt', json={'custom_keywords': custom, 'weather': 'sunny weather'})
    prompt.raise_for_status()
    assert all(word in prompt.json()['prompt'] for word in custom)
    assert 'trời nắng' in prompt.json()['prompt']
    assert prompt.json()['prompt'].startswith('Tạo ảnh phối cảnh')
    assert 'sunny weather' not in prompt.json()['prompt']
    print('PASS: Vietnamese custom phrases and selected weather included in actual prompt')
    invalid = client.post('/api/generate-prompt', json={'custom_keywords': ['x' * 121]})
    assert invalid.status_code == 422
    print('PASS: API rejects oversized custom phrase')
    buffer = io.BytesIO()
    Image.new('RGB', (12, 9), (240, 180, 80)).save(buffer, format='PNG')
    content = buffer.getvalue()
    upload = client.post('/api/upload-image', files={'file': ('qa-reference.png', content, 'image/png')})
    upload.raise_for_status()
    data = upload.json()
    assert data['url'].startswith('/api/files/uploads/')
    name = data['saved_name']
    assert re.fullmatch(r'[0-9a-f]{32}\.png', name)
    stored = Path('backend/uploads').resolve() / name
    try:
        image = client.get(data['url'])
        image.raise_for_status()
        assert image.content == content and image.headers['content-type'] == 'image/png'
        print('PASS: multipart image upload, same-origin URL and byte-exact download')
        render = client.post('/api/render-image', data={'prompt': 'Custom scene'}, files={'file': ('qa-reference.png', content, 'image/png')})
        assert render.status_code == 503 and 'OPENAI_API_KEY' in render.json()['detail']
        print('PASS: render endpoint reports missing key without sending paid request')
    finally:
        assert stored.parent == Path('backend/uploads').resolve()
        stored.unlink(missing_ok=True)
print('Live integration checks passed; generated QA upload removed')
