# Changelog

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
