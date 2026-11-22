## Camera góc nhìn thứ ba tự tránh vật cản

- Camera người chơi dò tia nhìn từ vị trí camera về điểm ngắm trên nhân vật; các mesh vật cản nằm trực tiếp trên tia nhìn sẽ được tạm làm mờ, thay vì làm trong suốt toàn bộ tường hoặc đổi vị trí camera đột ngột.
- Vật cản mờ dần xuống alpha 0.2; khi tia nhìn thông thoáng, vật liệu gốc được phục hồi mượt mà. Nhiều lớp cửa / tường nằm nối tiếp trên cùng tia nhìn cũng được làm mờ để không còn lớp chắn thứ hai.
- Chỉ clone material cho đúng mesh đang che camera; vật liệu dùng chung của các mesh khác không bị ảnh hưởng. Khi rời trận / hủy scene, material gốc được khôi phục và bản clone được giải phóng.
- Hệ thống chỉ thay đổi render material, không sửa kích thước collider, Havok, va chạm server/client, vật lý chưởng pháp hay camera của người xem.

## Phòng 6 – Trước cổng công ty

- Tách cấu hình đấu trường theo `map` thay vì áp dụng một bộ `ARENA_PROPS` cho cả sáu phòng; phòng 1–5 giữ nguyên hình học cổ điển.
- Dựng checkpoint có hai cánh tường, trụ đọc thẻ và thanh chắn, chốt bảo vệ có cửa kính / quầy / mái, hành lang hẹp có ba cụm cửa thang máy mỗi bên, tường biên và tường hồi khép kín lối vòng ra ngoài, sau đó mở thành sảnh chữ T rộng có băng ghế thấp.
- Dùng cùng một tập prop (tọa độ, kích thước, độ cao, hình trụ / hộp) cho Babylon mesh, Havok aggregate, va chạm di chuyển phía server, dự đoán client, điểm tựa khi nhảy và kiểm tra chưởng va địa hình. Các chi tiết cửa thang máy là lớp ốp trực tiếp trên collider tường, không tạo cửa xuyên tường.
- Đặt điểm xuất hiện của hai võ sinh và tâm bốn camera người xem vào phần sảnh rộng của chữ T.
- Bổ sung kiểm thử map riêng, va chạm hành lang / thanh chắn, điểm đứng trên băng ghế và camera người xem.

## Luật HP, nổ chưởng khi va địa hình và đồng bộ collider đấu trường

- Thay hệ thống tính điểm bằng 100 HP cho mỗi võ sinh; mọi hit quyền pháp / chưởng pháp trừ HP của người nhận đòn, HP về 0 kết thúc trận và người gây sát thương thắng. Hỏa Diệm tiếp tục gây sát thương đốt theo thời gian (1 HP mỗi giây).
- Xóa bộ đếm 5 phút khỏi state server, HUD và màn hình kết quả; chỉ giữ 10 giây chuẩn bị chọn chưởng.
- Chưởng va mặt đất / vật cản tĩnh sẽ tạo vụ nổ; bán kính nổ bằng `0,14 × sát thương gốc` theo đơn vị thế giới, gây đủ sát thương và hiệu ứng của kỹ năng nếu đối thủ nằm trong vùng nổ nhưng không tạo knockback.
- Bổ sung hiệu ứng vụ nổ 3D đồng bộ cho võ sinh và người xem.
- Dùng chung dữ liệu collider cho mesh render và mô phỏng server: trụ dùng footprint hình tròn, khối đá / tường / bục dùng hộp đúng kích thước; đưa tường hậu điện và mái hậu điện vào danh sách vật cản authoritative.
- Bổ sung test cho luật 100 HP, bán kính nổ theo sát thương, va chạm chưởng với vật cản và di chuyển quanh trụ / tường hậu điện.

# Changelog

## Chế độ người xem

- Mở rộng mỗi `FightRoom` từ 2 lên tối đa 12 kết nối, vẫn chỉ cấp hai suất võ sinh; mười kết nối bổ sung được theo dõi trong map riêng.
- Bổ sung số người xem và trạng thái có thể xem vào API hàng chờ; người xem không được thêm vào `state.players` hoặc `runtime`.
- Thêm nhánh render người xem trong Babylon.js với bốn camera cố định Bắc / Đông / Nam / Tây ở góc nâng 45°. Nút HUD và phím `V` chuyển góc camera.
- Chỉ người chơi khởi tạo Havok và đăng ký input chiến đấu; người xem chỉ nhận state, animation và hiệu ứng trận.
- Khi võ sinh cuối cùng rời phòng sau trận đấu, server phát sự kiện đưa toàn bộ người xem về hàng chờ. Thêm unit test cho giới hạn người xem và góc camera.


## v4 – Quán tính khi nhảy, netcode dự đoán, cân bằng chưởng pháp

Điều khiển:

- Cú nhảy giữ nguyên vận tốc đang chạy lúc rời đất; đứng yên thì nhảy thẳng đứng.
- Khi đã ở trên không, vận tốc ngang bị khoá đến khi chạm đất (kể cả khinh công lần hai). Vận khí chưởng trên không làm nhân vật đứng yên, mất quán tính rồi rơi thẳng xuống.
- Có thể chạy áp sát rồi nhảy lên bục / đá / tường thấp và di chuyển trên đó; rơi khỏi mép mà chưa nhảy thì chỉ còn một lần khinh công.
- Có thể ra quyền pháp ngay khi đang chạy (trước đây phải đứng yên mới ra đòn).
- Đảo chiều hai phím mũi tên trái / phải: mũi tên trái quay camera sang trái, mũi tên phải quay camera sang phải. Điều khiển bằng chuột và mũi tên lên / xuống giữ nguyên.

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


## Luật chống né giao tranh và điều chỉnh tốc độ lùi

- Tốc độ lùi (S) giảm còn 85% tốc độ tiến (W): 4,76 so với 5,6 đơn vị/giây; mô phỏng dùng chung client / server nên vẫn giữ đối chiếu dự đoán nhất quán.
- Server theo dõi liên tục thời gian mỗi võ sinh không hướng về phía đối thủ, theo tick cố định 60 Hz. Bộ đếm được reset khi đối thủ trở lại nón nhìn ngang ±45° hoặc đi vào tầm 8 đơn vị của Đại Lực Kim Cang Chưởng.
- Một võ sinh không tìm kiếm giao tranh đủ 30 giây sẽ bị xử thua; nếu cả hai cùng chạm ngưỡng trong cùng tick thì cả hai cùng bị xử thua, không có người chiến thắng. Thông báo xử thua: “Các hạ liên tục né tránh giao tranh. Thật hèn nhát!”.
- Bảng kết quả chỉ còn tên và trạng thái thắng / thua, không hiển thị HP còn lại.
- Bổ sung unit test cho tốc độ lùi, góc nhìn ±45°, cự ly Kim Cang và reset điều kiện giao tranh.

## Lobby online count
- Replaced the home-page "PHÂN TÀI CAO THẤP" label with the live count of anonymous sessions currently on the lobby screen.
- Added a lightweight lobby presence heartbeat API. Entering an arena marks the browser session inactive; returning to the lobby resumes its heartbeat.
- Added server-side sequence checks and a 15-second TTL so delayed requests and abandoned tabs do not leave stale online counts.
- Kept the online indicator visible on mobile layouts.
