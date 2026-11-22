# Giang Hồ Tỉ Thí

Prototype game đối kháng võ thuật 3D 1-vs-1 chạy trên trình duyệt bằng WebGL.

- Client: React + Babylon.js.
- Multiplayer: Colyseus authoritative rooms over WebSocket.
- Physics scene: Babylon.js Physics V2 + Havok (fallback to visual scene if Havok cannot initialize).
- No account, no database, no saved progress.
- Six fixed rooms; each room has at most two fighters and ten read-only spectators.
- Room 6, “Trước cổng công ty”, has a separate checkpoint → elevator corridor → T-shaped lobby layout; its static geometry is shared by rendering and authoritative collision.
- The lobby header shows active lobby sessions only; fighter and spectator sessions are excluded.

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
npm test        # kiểm thử luật phòng, chiêu thức, đấu trường, auto-aim và mô phỏng chuyển động
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
| Space | Nhảy; nhấn lần hai khi đang trên không để khinh công. Cú nhảy giữ nguyên vận tốc đang chạy |

Camera ở góc nhìn sau-vai, cao hơn vai một chút; kéo chuột đổi hướng nhìn độc lập với góc nâng/hạ của camera. Di chuyển ngang A/D được quy chiếu theo trục màn hình của camera. Bộ pháp có hồi chiêu 3 giây. Trong khi ra chiêu, nhân vật bị khóa điều khiển di chuyển; ngoại lệ là lướt bằng bộ pháp. Camera tự dò vật cản trên đường nhìn; vật thể gần camera nhất đang che nhân vật sẽ tạm mờ dần, rồi hiện lại khi camera thông thoáng. Việc này chỉ tác động đến vật liệu render của đúng mesh bị che, không thay đổi collider hay vật lý.

Khi bật nhảy, nhân vật mang theo vận tốc chạy lúc rời đất (đứng yên thì nhảy thẳng đứng). Vận tốc ngang đó bị khoá cho đến khi chạm đất — kể cả khi khinh công lần hai — nên phải chọn hướng trước khi nhảy. Khi ở trên không, không thể dùng quyền pháp hoặc bộ pháp, nhưng có thể giữ C để vận khí chưởng: nhân vật đứng yên tại độ cao hiện tại trong lúc vận khí, mất hết quán tính, rồi rơi thẳng xuống sau khi chưởng được phát. Chạy áp sát rồi nhảy để lên bục, đá hoặc tường thấp và di chuyển trên đó.

## Số người đang ở sảnh

- Trang chủ gửi heartbeat 5 giây một lần khi đang ở màn hình sảnh; khi vào đấu trường (dù là võ sinh hay người xem), client đánh dấu session không còn ở sảnh.
- `GET /api/rooms` trả thêm trường `onlineCount`; số này chỉ đếm session đang active ở sảnh, không cộng người trong đấu trường.
- Server tự hết hạn session nếu không nhận heartbeat trong 15 giây, tránh giữ số online cũ khi tab hoặc trình duyệt bị đóng đột ngột.
- Việc đếm dùng session ẩn danh theo tab, không yêu cầu tài khoản và không lưu tiến trình game.

## Chế độ người xem

- Mỗi võ đài có tối đa 2 võ sinh và 10 người xem. Người vào khi hai võ sinh đã chiếm chỗ sẽ nhận vai trò người xem; khi phòng còn một chỗ võ sinh thì người vào vẫn là võ sinh thứ hai.
- Người xem nhận state và hiệu ứng trận đấu để render, nhưng không được nhận input điều khiển, chọn chưởng pháp hoặc gửi lệnh chiến đấu.
- Có 4 camera cố định quanh võ đài (Bắc, Đông, Nam, Tây). Mỗi camera đặt ở góc nâng 45° so với mặt sàn và nhìn về tâm võ đài. Nhấn `V` hoặc dùng nút **Góc máy kế tiếp** để chuyển camera.
- Khi cả hai võ sinh rời phòng sau khi trận kết thúc, server phát sự kiện đưa toàn bộ người xem trở lại hàng chờ.

## 4. Luật và nội dung đã có

- Sảnh hiển thị sáu phòng cố định với trạng thái trống / đang chờ / giao đấu / hết chỗ xem.
- Mỗi phòng có tối đa 12 client: hai võ sinh và mười người xem; client chỉ được join phòng có sẵn.
- Khi người thứ hai vào phòng, cả hai có tối đa 10 giây chọn một chưởng pháp; nếu cả hai chọn xong sớm, trận đấu bắt đầu ngay.
- Mỗi võ sinh bắt đầu với 100 HP. Sát thương từ quyền pháp / chưởng pháp trừ trực tiếp HP; ai về 0 HP trước thì thua. Trận đấu không có bộ đếm thời gian.
- Người còn lại thắng nếu đối thủ rời trận giữa chừng.
- Tốc độ lùi bằng S bằng 85% tốc độ tiến bằng W (4,76 so với 5,6 đơn vị/giây); tốc độ ngang không đổi khi chỉ dùng A / D.
- Luật chống né giao tranh được server kiểm tra ở 60 tick/giây: nếu liên tục không nhìn về phía đối thủ trong 30 giây thì bị xử thua. Đối thủ được xem là trong tầm nhìn khi nằm trong nón ngang ±45°, hoặc ở cách không quá tầm Đại Lực Kim Cang Chưởng (8 đơn vị). Chuyển lại hướng nhìn hoặc áp sát vào trong tầm này sẽ reset bộ đếm. Nếu cả hai cùng chạm ngưỡng trong một tick, cả hai cùng bị xử thua với thông báo “Các hạ liên tục né tránh giao tranh. Thật hèn nhát!”.
- Bảng kết quả chỉ hiển thị tên và trạng thái thắng / thua, không hiển thị HP còn lại.
- Võ sinh tự chuyển về sảnh sau khi trận kết thúc; người xem được server đưa về hàng chờ sau khi cả hai võ sinh rời sàn.
- Quyền pháp chung có chuỗi tối đa ba hit, xen kẽ hoạt ảnh đấm / đá; mỗi hit có khoảng giãn để đối thủ phục hồi.
- Chưởng pháp: Nhất Dương Chỉ, Giáng Long Chưởng, Hàn Băng Chưởng, Hoả Diệm Đao, Đại Lực Kim Cang Chưởng và Tiểu Vô Tướng Công. Hiệu ứng đạn có tạo hình riêng: tia laser, rồng khí uốn lượn, cụm tinh thể băng, lưỡi hỏa diệm và ấn bàn tay kim cang.

  | Chưởng | Vận khí | Hồi phục | Tầm |
  |---|---|---|---|
  | Nhất Dương Chỉ | 0,2s | 1,33s | Xa |
  | Giáng Long Chưởng | 1,0s | 3,33s | Xa |
  | Hàn Băng Chưởng | 0,53s | 2,67s | Trung |
  | Hoả Diệm Đao | 0,4s | 2,0s | Trung |
  | Đại Lực Kim Cang Chưởng | 0,53s | 2,67s | Gần, vùng rất rộng |

- Đại Lực Kim Cang Chưởng là một bàn tay khổng lồ (bán kính 3,6 quanh đường bay): không né ngang hay nhảy qua được, chỉ có thể lùi ra khỏi tầm. Vùng trúng là một mặt phẳng dày theo hướng bay nên không đánh trúng người đứng sau lưng; chỉ phần lõi nhỏ của chưởng bị địa hình triệt tiêu.
- Đấu trường có giới hạn di chuyển, trụ, tường, đá và bục; các vật cản đứng yên, collider được dùng chung dữ liệu kích thước / hình dạng với mesh render. Có thể nhảy lên đứng và di chuyển trên bục / đá / tường thấp; chưởng va vật cản tạo vụ nổ có bán kính bằng `0,14 × sát thương gốc` (đơn vị thế giới), gây đủ sát thương và hiệu ứng kỹ năng nhưng không đẩy lùi.
- Phòng 6 có kiến trúc riêng: tường cổng kiểm soát, trụ đọc thẻ và thanh chắn, chốt bảo vệ, hành lang chữ T hẹp với dãy cửa thang máy ở hai bên, tường biên và tường hồi khép kín hai khoang phụ, sau đó mở ra sảnh giao nhau rộng. Băng ghế thấp ở sảnh có thể nhảy lên và đứng; tường, kính, thanh chắn, thang máy và chưởng pháp dùng chung dữ liệu vật cản. Hai võ sinh xuất hiện ở phần sảnh rộng; bốn camera người xem hướng vào khu vực này.

## 5. Kiến trúc

```text
Browser (React + Babylon.js)
       |  WebSocket / Colyseus SDK
       v
Node.js + Colyseus
       |-- 6 fixed FightRoom instances
       |-- authoritative movement / hit detection / HP / knockout
       |-- temporary in-memory state only
       `-- Express: /api/rooms, /api/lobby/presence, /health, static dist/
```

Server quyết định trạng thái phòng, HP, vị trí, vận khí, hồi chiêu, va chạm đòn đánh và kết quả knockout. Client lo render Babylon.js, camera, hiệu ứng hình ảnh và gửi input. Không có DB nên server restart sẽ xóa trạng thái phòng và trận hiện tại.

### Đồng bộ chuyển động

Chuyển động của võ sinh được mô phỏng bởi một module xác định dùng chung cho cả hai phía (`src/game/fighter.js`), chạy theo tick cố định 60 Hz:

- **Lệnh điều khiển (`cmds`)**: mỗi tick client đóng gói một lệnh có số thứ tự (hướng WASD, góc nhìn, trạng thái giữ Q / C, nhảy, bộ pháp) và gửi cho server. Server xếp hàng và chạy lại đúng từng lệnh với cùng bước thời gian.
- **Dự đoán phía client**: client áp dụng lệnh lên bản mô phỏng của chính mình ngay lập tức, nên nhân vật phản hồi tức thì, không chờ một vòng mạng.
- **Đối chiếu với server (`ack`)**: 30 lần mỗi giây server gửi trạng thái chuẩn kèm số thứ tự lệnh đã xử lý. Client nhận trạng thái đó, chạy lại các lệnh chưa được xác nhận, và phần chênh lệch (ví dụ khi bị đánh lùi) được làm mượt dần thay vì giật vị trí.
- **Nội suy đối thủ**: đối thủ được vẽ trễ 100 ms, nội suy giữa hai snapshot theo đồng hồ mô phỏng của server (`state.clock`), nên chuyển động đều kể cả khi gói tin đến không đều.
- **Render**: vị trí vẽ được nội suy giữa hai tick mô phỏng nên mượt ở mọi tần số quét; camera bám theo vị trí đã làm mượt; khớp tay chân chuyển tư thế bằng làm mượt theo thời gian thực và nhịp chân theo đúng quãng đường đi được.
- **Chống gian lận tốc độ**: server chỉ xử lý lệnh theo thời gian thực đã trôi qua (cộng một khoảng bù trễ nhỏ); client im lặng quá 250 ms sẽ được mô phỏng với input trung tính.

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
              #   spectatorCameras.js – giới hạn người xem và 4 camera cố định
              #   rules.js   – hằng số phòng, chưởng pháp, cấu hình hình học từng map
              #   fighter.js – mô phỏng võ sinh xác định, dùng chung client/server
              #   arena.js   – render, dự đoán phía client, nội suy
  ui/         # React lobby, prep screen, HUD và kết quả
  style.css   # giao diện
server/
  FightRoom.js # Colyseus authoritative room / combat / spectator seats
  index.js     # HTTP API, fixed rooms, static frontend
 tests/        # node:test cho luật cơ bản
```

## 8. Giới hạn của bản prototype

- Nhân vật và đấu trường hiện dựng bằng hình học procedural / primitive mesh; chưa có model humanoid rigged, motion capture hoặc bộ animation kung-fu chất lượng sản xuất. Các chuyển động, vòng vận khí và hiệu ứng chưởng là procedural để prototype gameplay. Giáng Long có pha xoay thân riêng trên model (không xoay camera), sau đó thu khí về tay và phóng rồng khí.
- Va chạm nhân vật, bục và đòn đánh được mô phỏng bằng logic gọn nhẹ dùng chung giữa server và client (`fighter.js`); Havok đang bật cho vật lý cảnh tĩnh ở client, chưa phải một hệ thống ragdoll / character controller Havok đầy đủ. Bộ pháp có thời gian hồi chiêu 3 giây; chế độ hỗ trợ ngắm mục tiêu 25° là khóa hướng tại thời điểm phóng, không phải đạn tự đuổi theo đối thủ.
- Sáu phòng hiện là sáu phòng cố định trên một tiến trình Node; chưa có Redis/presence để scale nhiều server.
- Cần kiểm thử thực tế với hai trình duyệt / độ trễ mạng và cân bằng lại sát thương, tầm đánh, knockback trước khi mở public.
- Hiệu ứng, animation và cân bằng combat là bản nền để tiếp tục thay asset/điều chỉnh, không phải sản phẩm thương mại đã QA.
