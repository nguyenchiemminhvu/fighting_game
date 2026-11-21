# Giang Hồ Tỉ Thí

Prototype game đối kháng võ thuật 3D 1-vs-1 chạy trên trình duyệt bằng WebGL.

- Client: React + Babylon.js.
- Multiplayer: Colyseus authoritative rooms over WebSocket.
- Physics scene: Babylon.js Physics V2 + Havok (fallback to visual scene if Havok cannot initialize).
- No account, no database, no saved progress.
- Six fixed rooms; each room has at most two players and no spectator slot.

## 1. Yêu cầu

- Node.js **22.12 trở lên**.
- npm đi cùng Node.js.
- Trình duyệt desktop hỗ trợ WebGL 2; Chrome / Edge / Firefox bản mới.
- Kết nối Internet trong lần `npm install` đầu tiên để tải dependencies.

## 2. Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:5173`. Server Colyseus chạy ở `http://localhost:2567`.

Để kiểm tra song đấu, mở game ở hai cửa sổ trình duyệt hoặc một cửa sổ thường và một cửa sổ ẩn danh, sau đó chọn cùng một phòng. Phòng chỉ bắt đầu bộ đếm chọn chưởng khi có đủ hai người.

Các lệnh hữu ích:

```bash
npm run check   # kiểm tra cú pháp các module JavaScript phía server/game
npm test        # kiểm thử luật phòng, chiêu thức, đấu trường và auto-aim
npm run build   # build client vào dist/
npm start       # chạy server; nếu dist/ tồn tại server cũng phục vụ frontend
```

## 3. Điều khiển

| Phím / thao tác | Chức năng |
|---|---|
| W / A / S / D | Chạy tiến / trái / lùi / phải theo hướng camera |
| Nhấn nhanh hai lần cùng phím WASD | Bộ pháp lướt nhanh theo hướng đó · hồi chiêu 3 giây |
| Chuột trái kéo hoặc pointer-lock | Xoay camera: kéo trái nhìn phải, kéo phải nhìn trái; kéo lên nhìn lên, kéo xuống nhìn xuống |
| Giữ mũi tên lên / xuống | Nhìn lên / nhìn xuống liên tục, mượt |
| Giữ mũi tên trái / phải | Xoay camera trái / phải liên tục, mượt |
| Q (nhấn) | Một chiêu quyền pháp |
| Q (giữ) | Chuỗi quyền pháp tối đa ba đòn, đấm / đá xen kẽ |
| C (giữ) | Vận khí và tự động phát chưởng khi đủ thời gian |
| Space | Nhảy; nhấn lần hai khi đang trên không để khinh công |

Camera ở góc nhìn sau-vai, cao hơn vai một chút; kéo chuột đổi hướng nhìn độc lập với góc nâng/hạ của camera. Di chuyển ngang A/D được quy chiếu theo trục màn hình của camera. Bộ pháp có hồi chiêu 3 giây. Trong khi ra chiêu, nhân vật bị khóa điều khiển di chuyển; ngoại lệ là lướt bằng bộ pháp. Khi ở trên không, không thể dùng quyền pháp hoặc bộ pháp, nhưng có thể giữ C để vận khí chưởng. Nhân vật được giữ tại độ cao hiện tại trong lúc vận khí trên không, rồi rơi xuống sau khi chưởng được phát.

## 4. Luật và nội dung đã có

- Sảnh hiển thị sáu phòng cố định với trạng thái trống / đang chờ / đủ người.
- Phòng có tối đa hai client; client chỉ được join phòng có sẵn, không có spectator.
- Khi người thứ hai vào phòng, cả hai có tối đa 10 giây chọn một chưởng pháp; nếu cả hai chọn xong sớm, trận đấu bắt đầu ngay.
- Trận đấu kéo dài 5 phút. Không có thanh máu; điểm được cộng khi đòn đánh trúng. Hết giờ, người nhiều điểm hơn thắng.
- Người còn lại thắng nếu đối thủ rời trận giữa chừng.
- Kết thúc trận, game tự chuyển về sảnh.
- Quyền pháp chung có chuỗi tối đa ba hit, xen kẽ hoạt ảnh đấm / đá; mỗi hit có khoảng giãn để đối thủ phục hồi.
- Chưởng pháp: Nhất Dương Chỉ, Giáng Long Chưởng, Hàn Băng Chưởng, Hoả Diệm Đao, Đại Lực Kim Cang Chưởng và Tiểu Vô Tướng Công. Hiệu ứng đạn có tạo hình riêng: tia laser, rồng khí uốn lượn, cụm tinh thể băng, lưỡi hỏa diệm và ấn bàn tay kim cang.
- Đấu trường có giới hạn di chuyển, trụ, tường, đá và bục; các vật cản đứng yên, có thể nhảy lên bục, đạn chưởng bị triệt tiêu khi va vật cản.

## 5. Kiến trúc

```text
Browser (React + Babylon.js)
       |  WebSocket / Colyseus SDK
       v
Node.js + Colyseus
       |-- 6 fixed FightRoom instances
       |-- authoritative movement / hit detection / score / timers
       |-- temporary in-memory state only
       `-- Express: /api/rooms, /health, static dist/
```

Server quyết định trạng thái phòng, bộ đếm, vị trí, vận khí, hồi chiêu, va chạm đòn đánh và điểm. Client lo render Babylon.js, camera, hiệu ứng hình ảnh và gửi input. Không có DB nên server restart sẽ xóa trạng thái phòng và trận hiện tại.

## 6. Deploy đề xuất: Railway (một service)

GitHub nên dùng để lưu source code; **GitHub Pages không chạy được Colyseus WebSocket server**. Cách đơn giản là đưa repo lên GitHub rồi deploy chính repo đó thành một Node service trên Railway. Một service sẽ phục vụ cả frontend lẫn server game cùng domain nên không phải cấu hình CORS chéo domain.

### Bước A — đưa source lên GitHub

1. Giải nén ZIP.
2. Tạo repository mới trên GitHub.
3. Mở terminal tại thư mục project và chạy:

```bash
git init
git add .
git commit -m "Initial Giang Ho Ti Thi game"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repo>.git
git push -u origin main
```

### Bước B — deploy Railway

1. Tạo project mới trên Railway và chọn **Deploy from GitHub Repo**.
2. Chọn repository vừa push.
3. Thiết lập Build Command: `npm install && npm run build`.
4. Trong phần service Settings, đặt Build Command: `npm install && npm run build`; đặt Start Command: `npm start`. Railway cũng có thể tự nhận diện `npm start` từ `package.json`, nhưng nên đặt rõ để tránh nhầm cấu hình.
5. Trong Variables, thêm `NODE_ENV=production`. Railway tự cấp biến `PORT`; server đã bind `0.0.0.0` và đọc `process.env.PORT`.
6. Trong Networking, tạo Public Domain cho service.
7. Kiểm tra `https://<your-domain>/health` trả JSON có `ok: true`, rồi mở domain để chơi.

Client tự dùng cùng origin làm server URL khi deploy chung một service. WebSocket sẽ sử dụng kết nối bảo mật tương ứng với HTTPS. Khi push commit mới lên branch đã kết nối, Railway sẽ tự build và deploy lại service.

### Nếu deploy frontend và server ở hai nơi riêng

- Deploy `dist/` lên host frontend như Vercel/Netlify.
- Deploy Node/Colyseus server lên Railway/Render/Fly.io.
- Trước khi build frontend, đặt `VITE_SERVER_URL=https://<domain-server>`.
- Trên server, đặt `ALLOWED_ORIGINS=https://<domain-frontend>`.
- Cần host server hỗ trợ WebSocket và tiến trình Node chạy liên tục. Không chỉ dùng GitHub Pages cho cả game.

Tài liệu chính thức tham khảo: [GitHub — tạo repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository), [Railway — Quick Start](https://docs.railway.com/quick-start), [Railway — Services / deploy từ GitHub](https://docs.railway.com/services), [Railway — Build và Start Commands](https://docs.railway.com/builds/build-and-start-commands).

## 7. Cấu trúc thư mục

```text
src/
  game/       # Babylon.js scene, input, client rendering, luật dùng chung
  ui/         # React lobby, prep screen, HUD và kết quả
  style.css   # giao diện
server/
  FightRoom.js # Colyseus authoritative room / combat
  index.js     # HTTP API, fixed rooms, static frontend
 tests/        # node:test cho luật cơ bản
```

## 8. Giới hạn của bản prototype

- Nhân vật và đấu trường hiện dựng bằng hình học procedural / primitive mesh; chưa có model humanoid rigged, motion capture hoặc bộ animation kung-fu chất lượng sản xuất. Các chuyển động, vòng vận khí và hiệu ứng chưởng là procedural để prototype gameplay. Giáng Long có pha xoay thân riêng trên model (không xoay camera), sau đó thu khí về tay và phóng rồng khí.
- Va chạm nhân vật, bục và đòn đánh được mô phỏng bằng logic server gọn nhẹ; Havok đang bật cho vật lý cảnh tĩnh ở client, chưa phải một hệ thống ragdoll / character controller Havok đầy đủ. Bộ pháp có thời gian hồi chiêu 3 giây; chế độ hỗ trợ ngắm mục tiêu 25° là khóa hướng tại thời điểm phóng, không phải đạn tự đuổi theo đối thủ.
- Sáu phòng hiện là sáu phòng cố định trên một tiến trình Node; chưa có Redis/presence để scale nhiều server.
- Cần kiểm thử thực tế với hai trình duyệt / độ trễ mạng và cân bằng lại điểm, tầm đánh, knockback trước khi mở public.
- Hiệu ứng, animation và cân bằng combat là bản nền để tiếp tục thay asset/điều chỉnh, không phải sản phẩm thương mại đã QA.
