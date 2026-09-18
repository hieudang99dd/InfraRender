import os

api_path = 'frontend/src/lib/api.ts'
with open(api_path, 'r', encoding='utf-8') as f:
    content = f.read()

prefix = '''export function getBackendUrl() {
  const url = process.env.NEXT_PUBLIC_INFRARENDER_API_URL || "http://127.0.0.1:8000";
  return url.replace(/\\/+$/, "");
}

'''
if 'getBackendUrl' not in content:
    content = prefix + content

content = content.replace('fetch(path, ', "fetch(path.startsWith('http') ? path : ${getBackendUrl()}, ")
# Need to rewrite the return URL of the proxy to include the backendURL if it's relative
# wait, the backend currently returns /api/files/... if using the proxy, or maybe the raw URL?
# Let's verify what pi.ts actually does.

with open(api_path, 'w', encoding='utf-8') as f:
    f.write(content)
