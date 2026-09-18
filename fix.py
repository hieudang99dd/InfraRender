import os

with open('frontend/src/components/layout/RightPanel.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    ("Mức sáng tạo là định hướng trong prompt; không phải tham số cường độ của dịch vụ tạo ảnh.", 
     "Mức độ sáng tạo sẽ định hướng Chỉ thị AI; không gửi trực tiếp dưới dạng tham số API gốc."),
]

for old, new in replacements:
    text = text.replace(old, new)

with open('frontend/src/components/layout/RightPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
