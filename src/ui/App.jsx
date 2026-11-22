import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Client } from '@colyseus/sdk';
import { mountArena } from '../game/arena.js';
import { PALMS, PALM_IDS, ROOMS } from '../game/rules.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:2567'
    : window.location.origin
);

const START_ROOM_STATE = {
  phase: 'waiting', prepLeft: 10, players: [], localId: '',
};

function makeName() {
  return `Cao thủ ${Math.floor(10 + Math.random() * 90)}`;
}


function getRoomStatus(room) {
  if (room.players >= 2) {
    if (!room.canWatch || room.viewerCount >= (room.viewerCapacity ?? 10)) {
      return { label: 'Không nhận thêm người', className: 'busy', disabled: true };
    }
    return { label: room.phase === 'end' ? 'Trận đấu đã kết thúc' : 'Đang giao đấu · có thể xem', className: 'watching', disabled: false, action: 'watch' };
  }
  if (room.phase === 'end') return { label: 'Đang kết thúc', className: 'busy', disabled: true };
  if (room.players === 1) return { label: 'Đang chờ đối thủ', className: 'waiting', disabled: false };
  return { label: 'Còn trống', className: 'open', disabled: false };
}

export function App() {
  const [screen, setScreen] = useState('lobby');
  const [rooms, setRooms] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [name, setName] = useState(makeName);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [joining, setJoining] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('Đang kết nối võ đài');
  const [roomKey, setRoomKey] = useState('room-1');
  const [isSpectator, setIsSpectator] = useState(false);
  const [spectatorCamera, setSpectatorCamera] = useState({ index: 0, label: 'Chính diện Bắc' });
  const [gameState, setGameState] = useState(START_ROOM_STATE);
  const [matchResult, setMatchResult] = useState(null);
  const canvasRef = useRef(null);
  const roomRef = useRef(null);
  const arenaRef = useRef(null);
  const returnTimerRef = useRef(null);
  const lobbyPresenceRef = useRef(null);
  if (!lobbyPresenceRef.current) {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `lobby-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    lobbyPresenceRef.current = { id, sequence: 0 };
  }

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/rooms`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRooms(data.rooms ?? []);
      setOnlineCount(Number.isFinite(data.onlineCount) ? data.onlineCount : 0);
      setError((current) => current.startsWith('Không thể tải') ? '' : current);
    } catch {
      setError('Không thể tải danh sách phòng. Hãy kiểm tra server Colyseus đã chạy chưa.');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== 'lobby') return undefined;
    fetchRooms();
    const timer = window.setInterval(fetchRooms, 1600);
    return () => window.clearInterval(timer);
  }, [screen, fetchRooms]);

  useEffect(() => {
    if (screen !== 'lobby') return undefined;
    const presence = lobbyPresenceRef.current;
    const reportPresence = (active) => {
      presence.sequence += 1;
      fetch(`${SERVER_URL}/api/lobby/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: presence.id, sequence: presence.sequence, active }),
        keepalive: true,
      }).catch(() => { /* The server expires missed heartbeats automatically. */ });
    };
    reportPresence(true);
    const heartbeat = window.setInterval(() => reportPresence(true), 5000);
    return () => {
      window.clearInterval(heartbeat);
      reportPresence(false);
    };
  }, [screen]);

  const returnToLobby = useCallback(async (leave = true) => {
    if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
    returnTimerRef.current = null;
    arenaRef.current?.dispose();
    arenaRef.current = null;
    const activeRoom = roomRef.current;
    roomRef.current = null;
    if (leave && activeRoom) {
      try { await activeRoom.leave(); } catch { /* socket may already be closed */ }
    }
    setMatchResult(null);
    setGameState(START_ROOM_STATE);
    setIsSpectator(false);
    setSpectatorCamera({ index: 0, label: 'Chính diện Bắc' });
    setScreen('lobby');
    setJoining('');
    setError('');
  }, []);

  const joinRoom = useCallback(async (room) => {
    const canJoinPlayer = room?.players < 2 && room?.phase !== 'end';
    const canJoinAsViewer = room?.players === 2 && room?.canWatch && room.viewerCount < (room.viewerCapacity ?? 10);
    if (!room?.roomId || (!canJoinPlayer && !canJoinAsViewer) || joining) return;
    setJoining(room.key);
    setError('');
    setRoomKey(room.key);
    try {
      const client = new Client(SERVER_URL);
      const joinedRoom = await client.joinById(room.roomId, { name: name.trim().slice(0, 20) || makeName() });
      roomRef.current = joinedRoom;
      // Ask after subscribing so role detection does not depend on when the
      // initial Colyseus state snapshot reaches this client.
      const assignedRole = await new Promise((resolve) => {
        const roleTimeout = window.setTimeout(() => resolve(null), 1800);
        joinedRoom.onMessage('room-role', (payload) => {
          window.clearTimeout(roleTimeout);
          resolve(payload?.role ?? null);
        });
        joinedRoom.send('request-role');
      });
      const hasFighterSeat = joinedRoom.state?.players?.has?.(joinedRoom.sessionId);
      const spectator = assignedRole === 'spectator'
        || (assignedRole !== 'player' && (hasFighterSeat === false || (hasFighterSeat == null && room.players >= 2)));
      setIsSpectator(spectator);
      setSpectatorCamera({ index: 0, label: 'Chính diện Bắc' });
      setConnection(spectator ? 'Đã vào chế độ người xem' : 'Đã kết nối võ đài');
      setScreen('fight');
    } catch (joinError) {
      setError(joinError?.message?.includes('seat') || joinError?.message?.includes('full')
        || joinError?.message?.includes('người xem')
        ? 'Phòng vừa đủ người. Hãy chọn một phòng khác.'
        : 'Không vào được phòng. Kết nối có thể đã gián đoạn, vui lòng thử lại.');
      setJoining('');
      fetchRooms();
    }
  }, [fetchRooms, joining, name]);

  useEffect(() => {
    if (screen !== 'fight' || !roomRef.current || !canvasRef.current) return undefined;
    let cancelled = false;
    const room = roomRef.current;
    setConnection('Đang dựng đấu trường 3D…');
    setGameState({ ...START_ROOM_STATE, localId: room.sessionId });
    mountArena(canvasRef.current, room, roomKey, {
      spectator: isSpectator,
      onCameraChange: setSpectatorCamera,
      onState: (nextState) => {
        if (!cancelled) {
          setGameState(nextState);
          if (isSpectator && nextState.phase === 'end') {
            setMatchResult((current) => current ?? {
              winnerSessionId: nextState.winnerSessionId ?? '',
              reason: nextState.resultReason ?? 'knockout',
              players: (nextState.players ?? []).map((player) => ({ id: player.id, name: player.name })),
            });
          }
          if (isSpectator) {
            setConnection(nextState.phase === 'end' ? 'Đang xem kết quả trận đấu' : 'Đang xem trực tiếp · mạng trực tuyến');
          } else if (nextState.phase === 'fight') setConnection('Đang giao đấu · mạng trực tuyến');
          else if (nextState.phase === 'select') setConnection('Đang chuẩn bị chọn chưởng');
          else setConnection('Đang chờ đối thủ');
        }
      },
      onMessage: (type, payload) => {
        if (type === 'match-end') {
          setMatchResult(payload);
          setConnection(isSpectator ? 'Đang xem kết quả trận đấu' : 'Trận đấu kết thúc');
          if (!isSpectator) {
            if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
            returnTimerRef.current = window.setTimeout(() => returnToLobby(true), 6500);
          }
        }
      },
    }).then((arena) => {
      if (cancelled) arena.dispose();
      else arenaRef.current = arena;
    }).catch((mountError) => {
      console.error(mountError);
      setError('Không khởi tạo được WebGL. Hãy dùng trình duyệt hỗ trợ WebGL 2 và cập nhật driver đồ họa.');
    });
    room.onMessage('spectator-eject', () => {
      if (!cancelled && isSpectator) returnToLobby(true);
    });
    room.onError(() => setConnection('Mất kết nối với máy chủ'));
    room.onLeave(() => {
      if (!cancelled && room.state?.phase !== 'end') {
        setConnection('Kết nối đã đóng');
        returnToLobby(false);
      }
    });
    return () => {
      cancelled = true;
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
      arenaRef.current?.dispose();
      arenaRef.current = null;
    };
  }, [screen, roomKey, isSpectator, returnToLobby]);

  const localPlayer = useMemo(() => gameState.players?.find((p) => p.id === gameState.localId), [gameState]);
  const opponent = useMemo(() => gameState.players?.find((p) => p.id !== gameState.localId), [gameState]);
  const setPalm = (id) => {
    if (arenaRef.current) arenaRef.current.setPalm(id);
    else roomRef.current?.send('select-palm', { palm: id });
  };
  const leaveMatch = () => returnToLobby(true);

  if (screen === 'fight') {
    return (
      <main className="fight-screen">
        <canvas ref={canvasRef} className="game-canvas" aria-label="Đấu trường Giang Hồ Tỉ Thí" />
        <div className="game-vignette" />
        {isSpectator ? (
          <header className="fight-topbar spectator-topbar">
            <div className="fighter-score">
              <span className="fighter-caption">CHẾ ĐỘ NGƯỜI XEM</span>
              <strong>{ROOMS.find((room) => room.key === roomKey)?.name ?? 'Đấu trường'}</strong>
              <span className="score-status">{gameState.spectatorCount ?? 0}/10 người xem</span>
            </div>
            <div className="match-clock">
              <span>{gameState.phase === 'select' ? 'CHUẨN BỊ GIAO ĐẤU' : gameState.phase === 'end' ? 'KẾT QUẢ TRẬN' : 'GIAO ĐẤU KHÔNG GIỚI HẠN'}</span>
              <strong>{gameState.phase === 'select' ? `00:${String(gameState.prepLeft ?? 10).padStart(2, '0')}` : gameState.phase === 'end' ? 'KẾT THÚC' : 'VÔ HẠN'}</strong>
              <small>{connection}</small>
            </div>
            {gameState.phase !== 'end' && (
              <div className="spectator-scoreboard">
                {(gameState.players ?? []).map((player, index) => (
                  <div className="spectator-score" key={player.id}>
                    <span>{index === 0 ? 'VÕ SINH 1' : 'VÕ SINH 2'}</span>
                    <strong>{player.name}</strong>
                    <b>{player.hp ?? 100}<small> / 100 HP</small></b>
                    <div className={`hp-meter spectator-hp-meter ${(player.hp ?? 100) <= 30 ? 'critical' : ''}`}><i style={{ width: `${Math.max(0, Math.min(100, player.hp ?? 100))}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
            <button className="leave-button" onClick={leaveMatch}>Rời chế độ xem</button>
          </header>
        ) : (
          <header className="fight-topbar">
            <div className="fighter-score">
              <span className="fighter-caption">BẠN</span>
              <strong>{localPlayer?.name ?? name}</strong>
              {gameState.phase !== 'end' && (
                <>
                  <span className="hp-number">{localPlayer?.hp ?? 100}<small> / 100 HP</small></span>
                  <div className={`hp-meter ${(localPlayer?.hp ?? 100) <= 30 ? 'critical' : ''}`}><i style={{ width: `${Math.max(0, Math.min(100, localPlayer?.hp ?? 100))}%` }} /></div>
                </>
              )}
              <span className="score-status">{localPlayer?.slowT > 0 ? 'Hàn khí' : localPlayer?.burnT > 0 ? 'Thiêu đốt' : 'Cao thủ'}</span>
            </div>
            <div className="match-clock">
              <span>{gameState.phase === 'select' ? 'CHUẨN BỊ' : gameState.phase === 'waiting' ? 'ĐỢI ĐỐI THỦ' : gameState.phase === 'end' ? 'KẾT QUẢ' : 'GIAO ĐẤU KHÔNG GIỚI HẠN'}</span>
              <strong>{gameState.phase === 'select' ? `00:${String(gameState.prepLeft ?? 10).padStart(2, '0')}` : gameState.phase === 'waiting' ? '...' : gameState.phase === 'end' ? 'KẾT THÚC' : 'VÔ HẠN'}</strong>
              <small>{connection}</small>
            </div>
            <div className="fighter-score opponent-score">
              <span className="fighter-caption">ĐỐI THỦ</span>
              <strong>{opponent?.name ?? 'Đang chờ người chơi'}</strong>
              {gameState.phase !== 'end' && (
                <>
                  <span className="hp-number">{opponent?.hp ?? 100}<small> / 100 HP</small></span>
                  <div className={`hp-meter ${(opponent?.hp ?? 100) <= 30 ? 'critical' : ''}`}><i style={{ width: `${Math.max(0, Math.min(100, opponent?.hp ?? 100))}%` }} /></div>
                </>
              )}
              <span className="score-status">{opponent?.slowT > 0 ? 'Hàn khí' : opponent?.burnT > 0 ? 'Thiêu đốt' : opponent ? 'Đối thủ' : 'Chưa ghép cặp'}</span>
            </div>
            <button className="leave-button" onClick={leaveMatch}>Rời sàn</button>
          </header>
        )}

        {!isSpectator && gameState.phase === 'waiting' && !matchResult && (
          <section className="waiting-overlay glass-panel">
            <span className="eyebrow">{ROOMS.find((r) => r.key === roomKey)?.name ?? 'Đấu trường'}</span>
            <h2>Đang chờ đối thủ</h2>
            <p>Phòng chỉ dành cho hai cao thủ. Khi người thứ hai vào sàn, cả hai có 10 giây chọn chưởng pháp.</p>
            <div className="waiting-pulse"><i /><i /><i /></div>
            <button className="secondary-button" onClick={leaveMatch}>Quay về hàng chờ</button>
          </section>
        )}

        {!isSpectator && gameState.phase === 'select' && !matchResult && !localPlayer?.ready && (
          <section className="prep-panel glass-panel">
            <div className="prep-heading">
              <div>
                <span className="eyebrow">10 GIÂY TRƯỚC KHI GIAO ĐẤU</span>
                <h2>Chọn chưởng pháp</h2>
                <p>Mỗi cao thủ chọn một tuyệt kỹ. Giữ <kbd>C</kbd> để vận khí và tự động phát chưởng khi đủ lực.</p>
              </div>
              <div className="prep-countdown">{gameState.prepLeft ?? 10}<small>giây</small></div>
            </div>
            <div className="palm-grid">
              {PALM_IDS.map((id) => {
                const palm = PALMS[id];
                const selected = (localPlayer?.selectedPalm ?? 'chi') === id;
                return (
                  <button key={id} className={`palm-card ${selected ? 'selected' : ''}`} onClick={() => setPalm(id)}>
                    <span className="palm-icon">{palm.icon}</span>
                    <span className="palm-name">{palm.name}</span>
                    <span className="palm-description">{palm.description}</span>
                    <span className="palm-detail">{palm.detail}</span>
                    <span className="palm-selected">{selected ? 'ĐÃ CHỌN' : 'CHỌN TUYỆT KỸ'}</span>
                  </button>
                );
              })}
            </div>
            <div className="prep-footer"><span>Chọn xong có thể đổi lại cho đến khi hết giờ.</span><span>Đối thủ: {opponent?.name ?? 'đang kết nối'}</span></div>
          </section>
        )}

        {!isSpectator && gameState.phase === 'select' && !matchResult && localPlayer?.ready && (
          <section className="waiting-overlay glass-panel">
            <span className="eyebrow">ĐÃ CHỌN TUYỆT KỸ</span>
            <h2>{PALMS[localPlayer.selectedPalm]?.name ?? 'Chưởng pháp'}</h2>
            <p>Chưởng pháp đã khóa. Đang chờ đối thủ chọn xong — trận đấu sẽ bắt đầu ngay khi cả hai cao thủ sẵn sàng.</p>
            <div className="prep-countdown">{gameState.prepLeft ?? 10}<small>giây còn lại</small></div>
          </section>
        )}

        {!isSpectator && gameState.phase === 'fight' && !matchResult && (
          <>
            <div className="combat-hints glass-panel">
              <span><kbd>W A S D</kbd> Di chuyển</span>
              <span><kbd>Q</kbd> Quyền pháp</span>
              <span><kbd>C</kbd> Vận khí / chưởng</span>
              <span><kbd>Space</kbd> Nhảy · nhấn lần 2 khinh công</span>
            </div>
            <div className="skill-status glass-panel">
              <span className="status-label">CHƯỞNG ĐANG DÙNG</span>
              <strong>{PALMS[localPlayer?.palm]?.name ?? 'Nhất Dương Chỉ'}</strong>
              <span>{localPlayer?.cooldown > 0 ? `Hồi chiêu ${localPlayer.cooldown.toFixed(1)}s` : 'Sẵn sàng · giữ C'}</span>
              {localPlayer?.action === 'charge' && <div className="charge-track"><i style={{ width: `${Math.round((localPlayer.charge ?? 0) * 100)}%` }} /></div>}
              {localPlayer?.slowT > 0 && <em>Không thể dùng bộ pháp trong {localPlayer.slowT.toFixed(1)}s</em>}
            </div>
            <div className="bottom-hint">Kéo chuột để xoay góc nhìn · phím mũi tên cũng điều khiển camera</div>
          </>
        )}

        {isSpectator && (
          <section className="spectator-controls glass-panel">
            <div>
              <span className="status-label">GÓC QUAN SÁT {spectatorCamera.index + 1}/4</span>
              <strong>{spectatorCamera.label}</strong>
              <small>{gameState.phase === 'select' ? 'Hai cao thủ đang chuẩn bị' : gameState.phase === 'end' ? 'Đang chờ cao thủ rời sàn' : 'Đang truyền hình trực tiếp'}</small>
            </div>
            <button className="spectator-camera-button" onClick={() => arenaRef.current?.nextSpectatorCamera()}>
              Góc máy kế tiếp <kbd>V</kbd>
            </button>
          </section>
        )}

        {matchResult && (
          <section className="result-panel glass-panel">
            <span className="eyebrow">TRẬN ĐẤU ĐÃ KẾT THÚC</span>
            <h2>{matchResult.reason === 'mutual_disengagement'
              ? 'CẢ HAI ĐỀU BỊ XỬ THUA'
              : isSpectator
                ? 'TRẬN ĐẤU ĐÃ HẠ MÀN'
                : matchResult.winnerSessionId === gameState.localId
                  ? 'ĐẠI HIỆP ĐẠI THẮNG'
                  : matchResult.winnerSessionId ? 'THẤT BẠI' : 'BẤT PHÂN THẮNG BẠI'}</h2>
            <p>{matchResult.reason === 'mutual_disengagement'
              ? 'Các hạ liên tục né tránh giao tranh. Thật hèn nhát!'
              : matchResult.reason === 'disengagement'
                ? isSpectator
                  ? 'Một cao thủ bị xử thua. Các hạ liên tục né tránh giao tranh. Thật hèn nhát!'
                  : matchResult.winnerSessionId === gameState.localId
                    ? 'Đối thủ bị xử thua vì liên tục né tránh giao tranh.'
                    : 'Các hạ liên tục né tránh giao tranh. Thật hèn nhát!'
                : isSpectator
                  ? 'Bạn sẽ được đưa về hàng chờ khi hai cao thủ rời sàn đấu.'
                  : matchResult.reason === 'forfeit' ? 'Đối thủ đã rời trận.' : 'HP của đối thủ đã giảm về 0.'}</p>
            {(matchResult.players ?? []).length > 0 && (
              <div className="result-players">
                {(matchResult.players ?? []).map((player) => (
                  <div key={player.id}>
                    <span>{player.name}</span>
                    <strong>{matchResult.reason === 'mutual_disengagement'
                      ? 'Bị xử thua'
                      : player.id === matchResult.winnerSessionId
                        ? 'Chiến thắng'
                        : 'Thất bại'}</strong>
                  </div>
                ))}
              </div>
            )}
            {!isSpectator && <span className="return-countdown">Tự động về hàng chờ sau vài giây…</span>}
            <button className="primary-button" onClick={leaveMatch}>{isSpectator ? 'Rời chế độ xem' : 'Về hàng chờ ngay'}</button>
          </section>
        )}

        {error && <div className="game-error">{error}</div>}
      </main>
    );
  }

  return (
    <main className="lobby-screen">
      <div className="lobby-backdrop" />
      <div className="lobby-shell">
        <header className="lobby-header">
          <div className="brand-mark"><span>武</span></div>
          <div className="brand-copy"><span className="eyebrow">VÕ LÂM · SONG ĐẤU TRỰC TUYẾN</span><h1>GIANG HỒ <em>TỈ THÍ</em></h1></div>
          <div className="header-status" aria-live="polite" title="Chỉ tính người đang ở sảnh, không tính người trong đấu trường"><span className="status-dot" /><strong>{onlineCount}</strong><span>NGƯỜI ĐANG Ở SẢNH</span></div>
        </header>

        <section className="lobby-hero">
          <div className="hero-copy">
            <span className="eyebrow">MỘT SÀN ĐẤU · HAI CAO THỦ</span>
            <h2>Luận kiếm bằng<br /><em>võ học chân truyền.</em></h2>
            <p>Chọn một võ đài còn chỗ, chờ đối thủ hoặc bước vào trận tỉ thí. Không tài khoản, không lưu tiến trình — chỉ có võ công và bản lĩnh.</p>
            <div className="hero-tags"><span>✦ 1 VS 1</span><span>✦ 100 HP / NGƯỜI</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="moon-disc" />
            <div className="brush-ring ring-one" /><div className="brush-ring ring-two" />
            <div className="hero-silhouette silhouette-left"><i /><b /><span /><em /></div>
            <div className="hero-silhouette silhouette-right"><i /><b /><span /><em /></div>
            <div className="hero-cross">VS</div>
          </div>
        </section>

        <section className="lobby-content">
          <div className="section-heading">
            <div><span className="eyebrow">CHỌN ĐẤU TRƯỜNG</span><h2>Hàng chờ võ đài</h2></div>
            <div className="room-count">{rooms.filter((r) => r.players < 2 || r.canWatch).length || 0}<small> / 6 sàn còn chỗ</small></div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="room-grid">
            {(rooms.length ? rooms : ROOMS.map((r) => ({ ...r, players: 0, capacity: 2, roomId: null }))).map((room, index) => {
              const status = getRoomStatus(room);
              return (
                <article className={`room-card room-${index + 1}`} key={room.key}>
                  <div className="room-art"><span className="room-number">0{index + 1}</span><span className="room-landscape" /><span className="room-seal">{['亭', '寺', '武', '江', '竹', '企'][index]}</span></div>
                  <div className="room-info">
                    <div><h3>{room.name}</h3><p>{room.subtitle}</p></div>
                    <div className={`room-state ${status.className}`}><i />{status.label}</div>
                    <div className="room-footer"><span className="room-slots">{room.players}/2 <small>cao thủ</small><small className="viewer-slots"> · {room.viewerCount ?? 0}/10 người xem</small></span>
                      <button className={status.disabled || !room.roomId ? 'secondary-button' : 'room-enter'} disabled={status.disabled || !room.roomId || joining !== ''} onClick={() => joinRoom(room)}>
                        {joining === room.key ? 'Đang vào…' : status.disabled ? 'Đã đủ chỗ' : status.action === 'watch' ? 'Vào xem trận' : room.players === 1 ? 'Vào ghép cặp' : 'Vào sàn'}
                        {!status.disabled && <span>↗</span>}
                      </button>
                    </div>
                    {room.names?.length > 0 && <div className="room-player-names">Đang có mặt: {room.names.join(' · ')}</div>}
                  </div>
                </article>
              );
            })}
          </div>
          {loadingRooms && <p className="loading-note">Đang dò các võ đài…</p>}
        </section>

        <section className="lobby-guide">
          <div className="guide-heading"><span className="eyebrow">NHẬP MÔN</span><h2>Các bộ kỹ năng</h2></div>
          <div className="guide-grid">
            <div><span className="guide-icon">拳</span><h3>Quyền pháp</h3><p>Nhấn Q ra một đòn. Giữ Q để nối tối đa ba đòn quyền cước.</p></div>
            <div><span className="guide-icon">掌</span><h3>Chưởng pháp</h3><p>Chọn một trong sáu tuyệt kỹ trước trận. Giữ C vận khí, mỗi chưởng có tốc độ, tầm đánh, hồi chiêu và sức sát thương riêng.</p></div>
            <div><span className="guide-icon">步</span><h3>Bộ pháp</h3><p>WASD di chuyển. Nhấn đúp cùng một hướng để lướt nhanh. Nhấn Space để nhảy, nhấn lần hai để khinh công.</p></div>
          </div>
        </section>

        <footer className="lobby-footer">
          <label className="name-field"><span>Quý tính đại danh</span><input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} /><small>Tên tạm thời, chỉ tồn tại trong trận này.</small></label>
          <div className="footer-notes"><span>THẮNG BẠI TẠI KỸ NĂNG</span><small>Giang Hồ Tỉ Thí · WebGL / Babylon.js / Colyseus</small></div>
        </footer>
      </div>
    </main>
  );
}
