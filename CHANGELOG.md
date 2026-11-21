# Changelog

## v4 – Quán tính khi nhảy, netcode dự đoán, cân bằng chưởng pháp

Điều khiển:

- Cú nhảy giữ nguyên vận tốc đang chạy lúc rời đất; đứng yên thì nhảy thẳng đứng.
- Khi đã ở trên không, vận tốc ngang bị khoá đến khi chạm đất (kể cả khinh công lần hai). Vận khí chưởng trên không làm nhân vật đứng yên, mất quán tính rồi rơi thẳng xuống.
- Có thể chạy áp sát rồi nhảy lên bục / đá / tường thấp và di chuyển trên đó; rơi khỏi mép mà chưa nhảy thì chỉ còn một lần khinh công.
- Có thể ra quyền pháp ngay khi đang chạy (trước đây phải đứng yên mới ra đòn).

Chưởng pháp:

- Thời gian vận khí và thời gian hồi phục của mọi chưởng pháp còn 2/3 so với trước. Hồi chiêu bộ pháp giữ nguyên 3 giây.
- Đại Lực Kim Cang Chưởng to gấp 3 (hình ảnh lẫn vùng trúng): không né ngang hay nhảy qua được, chỉ có thể lùi ra xa. Vùng trúng là mặt phẳng theo hướng bay, đẩy lùi dọc hướng bay, không trúng người đứng sau lưng.
- Sửa lỗi Kim Cang Chưởng bị mặt đất triệt tiêu gần như ngay khi được ngắm tự động vào đối thủ đứng dưới đất.
- Hoạt ảnh xoay người của Giáng Long co giãn theo thời gian vận khí mới.

Độ mượt:

- Mô phỏng võ sinh chuyển sang module xác định dùng chung client / server (`src/game/fighter.js`), tick cố định 60 Hz.
- Client dự đoán chuyển động của chính mình và đối chiếu với trạng thái chuẩn của server; sai lệch được làm mượt thay vì giật.
- Đối thủ được nội suy giữa các snapshot theo đồng hồ mô phỏng của server; tần suất đồng bộ trạng thái tăng từ 20 lên 30 Hz.
- Camera bám theo vị trí đã làm mượt thay vì toạ độ mạng thô; mọi phép làm mượt không còn phụ thuộc tốc độ khung hình.
- Hoạt ảnh: khớp tay chân chuyển tư thế mượt, nhịp chân theo đúng tốc độ di chuyển, thân nghiêng theo hướng chạy / lướt, tư thế co – duỗi khi nhảy và rơi.
- Va chạm với vật cản trượt dọc theo tường và góc thay vì khựng lại; đẩy lùi mạnh không còn xuyên qua tường mỏng.

Giao thức mạng thay đổi: các message `input`, `q-held`, `charge-start`, `charge-cancel`, `jump`, `dash` được thay bằng `cmds` (client → server) và `ack` (server → client). Client và server phải được deploy cùng phiên bản.

## v3 – Natural vertical mouse look

- Đảo riêng trục dọc của chuột: di chuyển chuột lên thì camera nhìn lên; di chuyển chuột xuống thì camera nhìn xuống.
- Áp dụng cho cả Pointer Lock (`movementY`) và kéo chuột thông thường (`clientY`).
- Giữ nguyên điều khiển góc dọc bằng phím mũi tên và hướng tấn công độc lập với camera.

# Change log

## Camera / controls / kung-fu FX revision

- Reversed the horizontal screen-right movement basis so A moves left and D moves right in the third-person Babylon camera coordinates; dash uses the same corrected basis.
- Arrow keys now remain active while held and rotate camera smoothly using frame delta time.
- Reversed mouse drag axes to match the requested drag-to-look direction for both yaw and pitch.
- Moved the third-person camera to a slightly elevated over-the-shoulder position and separated camera pitch from attack pitch.
- Server now aims palm techniques at the opponent's current location only when the target is inside a 25-degree 3D forward cone; otherwise the projectile travels straight along the fighter heading. Aim is fixed at launch, not homing.
- Added a three-second dash cooldown.
- Added a smooth visual one-turn body/arm sweep and qi-gathering phase for Giáng Long; the body turn does not rotate the camera.
- Replaced generic projectile primitives with distinct procedural visuals: laser ray, animated flying dragon, ice crystal cluster, fire blade and golden palm seal.
- Added tests for forward-cone acquisition and elevated targets.
