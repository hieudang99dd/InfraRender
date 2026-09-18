import os

filepath = 'frontend/src/components/prompt/PromptDock.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    ('Soạn chỉ dẫn phối cảnh', 'Soạn Chỉ thị Thiết kế (Prompt)'),
    ('Cách tạo prompt', 'Phương thức Chỉ thị'),
    ('Ghép các lựa chọn thành prompt tiếng Việt', 'Ghép các lựa chọn thành Chỉ thị tiếng Việt'),
    ('Tự soạn hoặc nhấn Tổng hợp chỉ dẫn để tạo nội dung tự động.', 'Tự soạn hoặc nhấn Tổng hợp Chỉ thị để AI tạo nội dung tự động.'),
    ('{isGenerating ? "Đang tạo…" : prompt ? "Tạo lại prompt" : "Tạo prompt"}', '{isGenerating ? "Đang tổng hợp…" : prompt ? "Cập nhật Chỉ thị" : "Tổng hợp Chỉ thị"}'),
    ('Chỉ dẫn chính', 'Chỉ thị gốc'),
    ('Xóa chỉ dẫn', 'Xóa Chỉ thị'),
]

for old, new in replacements:
    text = text.replace(old, new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
