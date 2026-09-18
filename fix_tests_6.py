with open("backend/tests/test_render.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = [line for line in lines if "tạo ảnh thành công" not in line]

with open("backend/tests/test_render.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
