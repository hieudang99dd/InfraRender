import os
import re

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replacements = [
    ("Thông số phối cảnh", "Thông số thiết kế"),
    ("Loại cây xanh", "Loại thảm thực vật"),
    ("Mật độ cây xanh", "Mật độ phủ xanh"),
    ("Mật độ giao thông", "Mật độ phương tiện"),
    ("Bảo toàn hình học & sáng tạo", "Bảo toàn hình học & Sáng tạo"),
    ("Mức sáng tạo là định hướng trong prompt; không phải tham số cứng của dịch vụ tạo ảnh.", "Mức độ tự do sáng tạo sẽ định hướng Chỉ thị AI; không gửi trực tiếp dưới dạng tham số API gốc."),
    ("Mức độ diễn giải sáng tạo (%)", "Mức độ tự do sáng tạo (%)"),
    ("Bỏ chọn mức độ diễn giải", "Bỏ chọn tự do sáng tạo"),
    ("Điều chỉnh mức độ diễn giải sáng tạo", "Điều chỉnh mức độ tự do sáng tạo"),
    ("Diễn giải sáng tạo", "Tự do sáng tạo"),
    ("Góc nhìn & góc máy", "Góc nhìn & Phối cảnh"),
    ("Thông số xuất hình", "Thông số kết xuất"),
    ("Chờ dựng xong", "Đang trong quá trình kết xuất..."),
    ("Đang dựng phối cảnh, có thể mất vài phút…", "Đang khởi tạo kết xuất (Rendering), vui lòng chờ…"),
    ("Đang dựng…", "Đang kết xuất..."),
    ("Dựng phối cảnh", "Kết xuất (Render)"),
    ("Dịch vụ dựng phối cảnh chưa sẵn sàng", "Render Engine hiện chưa sẵn sàng"),
    ("Khong gian làm việc", "Không gian làm việc"),
]

replace_in_file('frontend/src/components/layout/RightPanel.tsx', replacements)
replace_in_file('frontend/src/components/prompt/PromptDock.tsx', replacements)
