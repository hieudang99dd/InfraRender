with open("frontend/src/components/layout/RightPanel.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("ThA'ng s` ph`i cnh", "Thông số thiết kế")
text = text.replace("Loi cAy xanh", "Loại cây xanh")
text = text.replace("M-t `T cAy xanh", "Mật độ cây xanh")
text = text.replace("Loi phng tin", "Loại phương tiện")
text = text.replace("M-t `T giao thA'ng", "Mật độ giao thông")
text = text.replace("Loi cA'ng trAnh", "Loại công trình")
text = text.replace("M-t `T cA'ng trAnh", "Mật độ công trình")
text = text.replace("Vch sn mt `?ng", "Vạch sơn mặt đường")
text = text.replace("Phong cAch hAnh nh", "Phong cách hình ảnh")
text = text.replace("Bo toAn hAnh h?c & sAng to", "Bảo toàn cấu trúc & Sáng tạo")
text = text.replace("Mcc sAng to lA `<nh h>ng trong prompt; khA'ng phi tham s` c?ng `T c a d<ch v to nh.", "Mức độ sáng tạo sẽ định hướng Chỉ thị AI; không gửi trực tiếp dưới dạng tham số API gốc.")
text = text.replace("Bo toAn hAnh kh`i cA'ng trAnh", "Bảo toàn cấu trúc hình học")
text = text.replace("Mcc `T di.n gii sAng to (%)", "Mức độ tự do sáng tạo (%)")
text = text.replace("GA3c nhAn & gA3c mAy", "Góc nhìn & Phối cảnh")
text = text.replace("GA3c mAy mong mu`n", "Góc máy mong muốn")
text = text.replace("ThA'ng s` xut hAnh", "Thông số kết xuất")
text = text.replace("?T phAn gii", "Độ phân giải")
text = text.replace("T l khung hAnh", "Tỷ lệ khung hình")

with open("frontend/src/components/layout/RightPanel.tsx", "w", encoding="utf-8") as f:
    f.write(text)
