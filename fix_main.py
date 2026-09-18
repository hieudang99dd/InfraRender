with open("backend/main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('validate_image, content, data.reference_image_name, "image/jpeg"', 'validate_image, content, data.reference_image_name, None')

with open("backend/main.py", "w", encoding="utf-8") as f:
    f.write(text)
