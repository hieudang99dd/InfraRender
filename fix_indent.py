with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "tAAAo AAAnh" in line or "quyAAA" in line or "tạo ảnh" in line:
        continue
    new_lines.append(line)

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
