import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Button, Stack,
  alpha, useTheme, useMediaQuery,
} from '@mui/material';
import { Lock, VideoCall } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { auth } from '../../lib/firebase';
import { connectSocket, getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';
import { useMeetingStore } from '../../store/meetingStore';
import { useMediasoup } from '../../hooks/useMediaSoup';
import { useTimeSync } from '../../hooks/useTimeSync';
import VideoGrid from '../../components/video/VideoGrid';
import MeetingControls from '../../components/meeting/MeetingControls';
import ChatPanel from '../../components/chat/ChatPanel';
import ParticipantsList from '../../components/meeting/ParticipantsList';
import WaitingRoomRequests from '../../components/meeting/WaitingRoomRequests';
import type { ParticipantMeta, ChatMessage, ProducerInfo, WaitingEntry } from '../../types';
import ReactionsOverlay from '../../components/meeting/Reactionsoverlay';

type Phase = 'connecting' | 'waiting' | 'joined' | 'ended' | 'error';

export default function MeetingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  const { user } = useAuthStore();
  const store = useMeetingStore();
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)

  const socketRef = useRef(getSocket());
  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoProducerRef = useRef<string | null>(null);
  const audioProducerRef = useRef<string | null>(null);
  const screenProducerRef = useRef<string | null>(null);
  const [booted, setBooted] = useState(false);
  const localIdentifier = useRef('')

  const ms = useMediasoup(socketRef);
  useTimeSync(socketRef.current);

  // ── Semantic theme aliases ────────────────────────────────────────────────
  const primary   = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const warning   = theme.palette.warning.main;
  const error     = theme.palette.error.main;
  const bgDefault = theme.palette.background.default;
  const bgPaper   = theme.palette.background.paper;
  const textPrimary   = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const divider   = theme.palette.divider;
  const isDark    = theme.palette.mode === 'dark';

  // ── Boot: connect socket & join room ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    if (roomId && booted) return;
    setBooted(true);

    async function boot() {
      if (!roomId) return;
      try {
        const token = await auth.currentUser?.getIdToken();
        const displayName = localStorage.getItem('displayName')
        const socket = await connectSocket(roomId, token??undefined, displayName??undefined);
        socketRef.current = socket;

        await new Promise<void>((res, rej) => {
          if (socket.connected) return res();
          socket.once('connect', res);
          socket.once('connect_error', (e) => rej(e));
          setTimeout(() => rej(new Error('Connection timeout')), 10000);
        });

        if (!mounted) return;

        const password = searchParams.get('pw') || undefined;

        socket.emit('room:join', { roomId, displayName: user?.name, password }, async (res: {
          id: string
          error?: string;
          waiting?: boolean;
          room?: Parameters<typeof store.setRoom>[0];
          participants?: ParticipantMeta[];
          chatHistory?: ChatMessage[];
          producers?: ProducerInfo[];
          rtpCapabilities?: Parameters<typeof ms.loadDevice>[0];
        }) => {
          if (!mounted) return;

          console.log({res: res.participants})
          if (res.error === 'ROOM_NOT_FOUND') { setErrorMsg('Room not found'); return setPhase('error'); }
          if (res.error === 'ROOM_FULL') { setErrorMsg('Room is full'); return setPhase('error'); }
          if (res.error === 'WRONG_PASSWORD') { setErrorMsg('Wrong password'); return setPhase('error'); }
          if (res.error) { setErrorMsg(res.error); return setPhase('error'); }

          if (res.waiting) {
            setPhase('waiting');
            socket.once('waiting:admitted', () => { if (mounted) bootMedia(socket, res); });
            socket.once('waiting:denied', () => {
              if (mounted) { setErrorMsg('Host denied your request'); setPhase('error'); }
            });
            return;
          }

          localIdentifier.current = res.id

          await bootMedia(socket, res);
        });
      } catch {
        if (!mounted) return;
        setErrorMsg('Failed to connect to server');
        setPhase('error');
      }
    }

    async function bootMedia(
      socket: ReturnType<typeof getSocket>,
      joinRes: {
        room?: Parameters<typeof store.setRoom>[0];
        participants?: ParticipantMeta[];
        chatHistory?: ChatMessage[];
        producers?: ProducerInfo[];
        rtpCapabilities?: Parameters<typeof ms.loadDevice>[0];
      },
    ) {
      if (!localIdentifier.current) {
        toast.error('INVALID_IENTIFIER');
        return;
      }

      store.setRoom(joinRes.room || null);
      store.setParticipants(joinRes.participants || []);

      console.log({joinRes})
      // Pre-populate remote stream entries for existing participants
      // so consumeProducer can merge role/isHost into them
      for (const p of joinRes.participants || []) {
        if (p.socketId !== socket.id) {
          store.setRemoteStream(p.socketId, {
            socketId: p.socketId,
            userId: p.userId,
            displayName: p.displayName,
            photoURL: p.photoURL,
            role: p.role,
            isHost: p.isHost,
            videoStream: null,
            audioStream: null,
            screenStream: null,
            audioLevel: 0,
          });
        }
      }

      store.setMessages(joinRes.chatHistory || []);
      store.setMySocketId(socket.id!);

      const myParticipant = joinRes.participants?.find((p) => p.userId === localIdentifier.current);
      store.setMyRole(myParticipant?.role || 'participant');

      const canProduce = myParticipant?.role !== 'viewer';

      if (joinRes.rtpCapabilities) await ms.loadDevice(joinRes.rtpCapabilities);
      if (canProduce) await ms.createSendTransport();
      await ms.createRecvTransport();
      if (canProduce) await startLocalMedia(socket);

      if (joinRes.producers) {
        for (const p of joinRes.producers) {
          if (p.socketId !== socket.id) {
            const participant = joinRes.participants?.find(part => part.socketId === p.socketId);
            await ms.consumeProducer(p, participant);
          }
        }
      }

      registerSocketListeners(socket);
      heartbeatRef.current = setInterval(() => { socket.emit('heartbeat'); }, 15000);
      setPhase('joined');
    }

    boot();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Start local media ─────────────────────────────────────────────────────
  async function startLocalMedia(socket: ReturnType<typeof getSocket>) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 1280, height: 720, frameRate: 30 },
      });
      store.setLocalStream(stream);
      store.setMicOn(true);
      store.setCameraOn(true);

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const producer = await ms.produceTrack(audioTrack, { kind: 'audio' });
        if (producer) audioProducerRef.current = producer.id;
        startAudioLevel(stream, socket);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const producer = await ms.produceTrack(videoTrack, { kind: 'video' });
        if (producer) videoProducerRef.current = producer.id;
      }
    } catch {
      toast.error('Could not access camera/microphone');
    }
  }

  // ── Audio level analysis ──────────────────────────────────────────────────
  function startAudioLevel(stream: MediaStream, socket: ReturnType<typeof getSocket>) {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      audioLevelTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        const level = Math.min(100, Math.round(avg * 2.5));
        socket.emit('audio:level', { level });

        const mySocketId = useMeetingStore.getState().mySocketId;
        if (mySocketId && level > 10) useMeetingStore.getState().setActiveSpeaker(mySocketId);
      }, 200);
    } catch {}
  }

  // ── Socket event listeners ────────────────────────────────────────────────
  function registerSocketListeners(socket: ReturnType<typeof getSocket>) {
    socket.on('participant:joined', (p: ParticipantMeta) => {
      store.addParticipant(p);
      store.setRemoteStream(p.socketId, {
        socketId: p.socketId, userId: p.userId,
        displayName: p.displayName, photoURL: p.photoURL,
        role: p.role, isHost: p.isHost,
        videoStream: null, audioStream: null, screenStream: null, audioLevel: 0,
      });
      toast(`${p.displayName} joined`, { icon: '👋' });
    });

    socket.on('participant:left', ({ socketId, displayName }: { socketId: string; displayName: string }) => {
      store.removeParticipant(socketId);
      store.removeRemoteStream(socketId);
      toast(`${displayName} left`);
    });

    socket.on('new:producer', async (info: ProducerInfo) => {
      if (info.socketId !== socket.id) {
        const participant = useMeetingStore.getState().participants.find(p => p.socketId === info.socketId);
        await ms.consumeProducer(info, participant);
      }
    });

    socket.on('producer:paused', ({ producerId, socketId }: { producerId: string; socketId: string }) => {
      const { remoteStreams } = useMeetingStore.getState();
      const remoteStream = remoteStreams.get(socketId);
      if (!remoteStream) return;

      const consumer = [...ms.consumersRef.current.values()].find(c => c.producerId === producerId);
      if (!consumer) return;

      const isVideo = remoteStream.videoStream?.getTracks().some(t => t.id === consumer.track.id);
      store.setRemoteStream(socketId, isVideo ? { videoStream: null } : { audioStream: null });
    });

    socket.on('producer:resumed', async ({ producerId, socketId }: { producerId: string; socketId: string }) => {
      const consumer = [...ms.consumersRef.current.values()].find(c => c.producerId === producerId);
      if (consumer) {
        await consumer.resume();
        const field = consumer.kind === 'video' ? 'videoStream' : 'audioStream';
        store.setRemoteStream(socketId, { [field]: new MediaStream([consumer.track]) });
      }
    });

    socket.on('producer:closed', ({ socketId }: { socketId: string }) => {
      store.removeRemoteStream(socketId);
    });

    socket.on('socket:disconnected', ({ socketId }: { socketId: string }) => {
      store.removeParticipant(socketId);
      store.removeRemoteStream(socketId);
    });

    socket.on('audio:level', ({ socketId, level }: { socketId: string; userId: string; level: number }) => {
      store.setRemoteStream(socketId, { audioLevel: level });
      if (level > 20) store.setActiveSpeaker(socketId);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      store.addMessage(msg);
      if (!useMeetingStore.getState().isChatOpen) {
        store.incrementUnread();
      }
    });

    socket.on('chat:typing', ({ socketId, displayName, isTyping }: { socketId: string; userId: string; displayName: string; isTyping: boolean }) => {
      store.setTyping(socketId, displayName, isTyping);
    });

    socket.on('waiting:request', (entry: WaitingEntry) => {
      store.addWaiting(entry);
      toast(`${entry.displayName} is waiting`, { icon: '🚪', duration: 8000 });
    });

    socket.on('room:locked', ({ locked, by }: { locked: boolean; by: string }) => {
      const { room } = useMeetingStore.getState();
      if (room) store.setRoom({ ...room, isLocked: locked });
      toast(locked ? `Room locked by ${by}` : `Room unlocked by ${by}`, { icon: locked ? '🔒' : '🔓' });
    });

    socket.on('room:ended', () => {
      setPhase('ended');
      toast.error('Meeting ended by host');
      setTimeout(() => navigate('/'), 2000);
    });

    socket.on('room:kicked', () => {
      setPhase('ended');
      toast.error('You were removed from the meeting');
      setTimeout(() => navigate('/'), 2000);
    });

    socket.on('host:mute-all', () => { handleMuteMic(true); toast('You were muted by the host', { icon: '🔇' }); });
    socket.on('host:mute-you', () => { handleMuteMic(true); toast('You were muted by the host', { icon: '🔇' }); });
    socket.on('host:disable-all-cameras', () => { handleMuteCamera(true); toast('Your camera was disabled by the host', { icon: '📷' }); });
  }

  // ── Media controls ────────────────────────────────────────────────────────
  function handleMuteMic(force?: boolean) {
    const newMuted = force !== undefined ? force : store.isMicOn;
    const track = store.localStream?.getAudioTracks()[0];
    if (track) track.enabled = !newMuted;
    store.setMicOn(!newMuted);
    if (audioProducerRef.current) {
      const producer = ms.producersRef.current.get(audioProducerRef.current);
      if (producer) {
        newMuted ? producer.pause() : producer.resume();
        socketRef.current?.emit(newMuted ? 'producer:pause' : 'producer:resume', { producerId: audioProducerRef.current }, () => {});
      }
    }
  }

  function handleMuteCamera(force?: boolean) {
    const newOff = force !== undefined ? force : store.isCameraOn;
    const track = store.localStream?.getVideoTracks()[0];
    if (track) track.enabled = !newOff;
    store.setCameraOn(!newOff);
    if (videoProducerRef.current) {
      const producer = ms.producersRef.current.get(videoProducerRef.current);
      if (producer) {
        newOff ? producer.pause() : producer.resume();
        socketRef.current?.emit(newOff ? 'producer:pause' : 'producer:resume', { producerId: videoProducerRef.current }, () => {});
      }
    }
  }

  async function handleToggleScreen() {
    if (store.isScreenSharing) {
      const track = store.localScreenStream?.getTracks()[0];
      track?.stop();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      if (screenProducerRef.current) {
        socketRef.current?.emit('producer:close', { producerId: screenProducerRef.current });
        ms.producersRef.current.get(screenProducerRef.current)?.close();
        ms.producersRef.current.delete(screenProducerRef.current);
        screenProducerRef.current = null;
      }
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        const camTrack = camStream.getVideoTracks()[0];
        store.localStream?.getVideoTracks().forEach(t => { store.localStream!.removeTrack(t); t.stop(); });
        store.localStream?.addTrack(camTrack);
        if (!videoProducerRef.current) return;
        const producer = ms.producersRef.current.get(videoProducerRef.current);
        if (producer) await producer.replaceTrack({ track: camTrack });
      } catch { toast.error('Could not restore camera'); }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        store.setLocalScreenStream(stream);
        store.setScreenSharing(true);
        const track = stream.getVideoTracks()[0];
        if (!videoProducerRef.current) return;
        const producer = ms.producersRef.current.get(videoProducerRef.current);
        await producer?.replaceTrack({ track });
        track.onended = () => handleToggleScreen();
      } catch { toast.error('Screen share cancelled'); }
    }
  }

  function handleReaction(emoji: string) { socketRef.current?.emit('reaction:send', { emoji }); }

  function handleToggleLayout() {
    const modes: Array<'grid' | 'spotlight'> = ['grid', 'spotlight'];
    const idx = modes.indexOf(store.layoutMode as 'grid' | 'spotlight');
    store.setLayoutMode(modes[(idx + 1) % modes.length]);
  }

  function handlePinToggle(socketId: string) {
    store.setPinnedSocketId(store.pinnedSocketId === socketId ? null : socketId);
  }

  function handleMuteParticipant(socketId: string) { socketRef.current?.emit('host:mute-participant', { socketId }); }
  function handleKickParticipant(socketId: string) { socketRef.current?.emit('host:kick', { socketId }, () => {}); }
  function handleToggleLock() {
    const locked = !store.room?.isLocked;
    socketRef.current?.emit('room:lock', { locked }, () => {});
  }
  function handleMuteAll() { socketRef.current?.emit('host:mute-all'); }

  function handleLeave() {
    socketRef.current?.emit('room:leave');
    cleanup();
    navigate('/');
  }

  function handleEndRoom() {
    socketRef.current?.emit('room:end', () => {});
    cleanup();
    navigate('/');
  }

  function cleanup() {
    if (audioLevelTimerRef.current) clearInterval(audioLevelTimerRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
  
  // Guard against double-close
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {});
    }
    audioContextRef.current = null;
  
    store.localStream?.getTracks().forEach((t) => t.stop());
    store.localScreenStream?.getTracks().forEach((t) => t.stop());
    ms.closeAll();
    store.reset();
  }

  useEffect(() => {
    return () => { cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'm' || e.key === 'M') handleMuteMic();
      if (e.key === 'v' || e.key === 'V') handleMuteCamera();
      if (e.key === 'c' || e.key === 'C') store.setChatOpen(!isChatOpen);
      if (e.key === 'p' || e.key === 'P') store.setParticipantsOpen(!store.isParticipantsOpen);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const isHost = store.room?.hostId === user?.id;
  const canProduce = store.myRole !== 'viewer';

  // ── Loading / gate phases ─────────────────────────────────────────────────
  const gateBackground = isDark
    ? `radial-gradient(ellipse 70% 60% at 50% 0%, ${alpha(primary, 0.12)} 0%, transparent 60%)`
    : `radial-gradient(ellipse 70% 60% at 50% 0%, ${alpha(primary, 0.06)} 0%, transparent 60%)`;

  if (phase === 'connecting') {
    return (
      <Box sx={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: bgDefault, backgroundImage: gateBackground, gap: 2,
      }}>
        <CircularProgress sx={{ color: primary }} size={36} />
        <Typography sx={{ color: textSecondary, fontSize: '0.9rem' }}>Connecting to room…</Typography>
      </Box>
    );
  }

  if (phase === 'waiting') {
    return (
      <Box sx={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: bgDefault, backgroundImage: gateBackground, gap: 3,
        px: 3,
      }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: '16px',
          background: alpha(warning, 0.15),
          border: `1px solid ${alpha(warning, 0.3)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock sx={{ fontSize: 28, color: warning }} />
        </Box>
        <Stack alignItems="center" spacing={1}>
          <Typography variant="h5" sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, color: textPrimary, textAlign: 'center' }}>
            Waiting to be admitted
          </Typography>
          <Typography variant="body2" sx={{ color: textSecondary }}>
            The host will let you in shortly
          </Typography>
        </Stack>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{
              width: 8, height: 8, borderRadius: '50%', background: primary,
              animation: `bounce 1.2s ${i * 0.2}s infinite`,
            }} />
          ))}
        </Box>
        <Button variant="outlined" onClick={() => navigate('/')} sx={{ mt: 1 }}>
          Leave queue
        </Button>
        <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)} }`}</style>
      </Box>
    );
  }

  if (phase === 'ended' || phase === 'error') {
    return (
      <Box sx={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: bgDefault, backgroundImage: gateBackground, gap: 3,
        px: 3, textAlign: 'center',
      }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: '16px',
          background: alpha(error, 0.12),
          border: `1px solid ${alpha(error, 0.25)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          {phase === 'ended' ? '👋' : '⚠️'}
        </Box>
        <Stack alignItems="center" spacing={1}>
          <Typography variant="h5" sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, color: textPrimary }}>
            {phase === 'ended' ? 'Meeting ended' : 'Cannot join'}
          </Typography>
          <Typography variant="body2" sx={{ color: textSecondary }}>
            {errorMsg || 'The meeting has ended'}
          </Typography>
        </Stack>
        <Button variant="contained" onClick={() => navigate('/')} startIcon={<VideoCall />}>
          Back to home
        </Button>
      </Box>
    );
  }

  // ── Sidepanel logic on mobile: only one open at a time, slides over video ─
  const hasSidePanel = isChatOpen || store.isParticipantsOpen;

  return (
    <Box sx={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: bgDefault, overflow: 'hidden',
    }}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: { xs: 1.5, sm: 2.5 }, py: { xs: 1, sm: 1.2 },
        background: isDark ? 'rgba(8,10,14,0.9)' : alpha(bgPaper, 0.88),
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${divider}`,
        zIndex: 10, flexShrink: 0,
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Logo mark */}
          <Box sx={{
            width: 28, height: 28, borderRadius: '7px',
            background: `linear-gradient(135deg, ${primary}, #8B5CF6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
            flexShrink: 0,
          }}>〜</Box>
          {/* Brand — hide on very small screens */}
          {!isMobile && (
            <Typography sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, fontSize: '0.9rem', color: textPrimary }}>
              MeetWave
            </Typography>
          )}
          {/* <Box sx={{ width: 1, height: 18, background: divider }} /> */}
          <Typography sx={{
            fontSize: '0.78rem', color: textSecondary,
            fontFamily: 'monospace', letterSpacing: '0.05em',
            // Truncate room ID on small screens
            maxWidth: { xs: 90, sm: 'none' },
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {roomId}
          </Typography>
        </Stack>
        <MeetingTimer />
      </Box>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Video area — shrinks when side panel is open on desktop */}
        <Box sx={{
          flex: 1, minWidth: 0, position: 'relative',
          // On mobile, hide video behind panel if panel is open
          display: { xs: hasSidePanel ? 'none' : 'block', md: 'block' },
        }}>
          <VideoGrid
            localMicOn={store.isMicOn}
            localCameraOn={store.isCameraOn}
            onPinToggle={handlePinToggle}
            onMuteParticipant={handleMuteParticipant}
            onKickParticipant={handleKickParticipant}
            isHostUser={isHost}
          />
          <ReactionsOverlay socket={socketRef.current} />
          {isHost && <WaitingRoomRequests socket={socketRef.current} />}
        </Box>

        {/* Side panels — full-width overlay on mobile, sidebar on desktop */}
        {isChatOpen && (
          <Box sx={{
            width: { xs: '100%', md: 320 },
            flexShrink: 0,
          }}>
            <ChatPanel socket={socketRef.current} />
          </Box>
        )}
        {store.isParticipantsOpen && (
          <Box sx={{
            width: { xs: '100%', md: 280 },
            flexShrink: 0,
          }}>
            <ParticipantsList socket={socketRef.current} isHost={isHost} />
          </Box>
        )}
      </Box>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0 }}>
        <MeetingControls
          onToggleMic={handleMuteMic}
          onToggleCamera={handleMuteCamera}
          onToggleScreen={handleToggleScreen}
          onLeave={handleLeave}
          onEndRoom={isHost ? handleEndRoom : undefined}
          onToggleLock={isHost ? handleToggleLock : undefined}
          onMuteAll={isHost ? handleMuteAll : undefined}
          onReaction={handleReaction}
          onToggleLayout={handleToggleLayout}
          isHost={isHost}
          roomMode={store.room?.mode || 'conference'}
          canProduce={canProduce}
        />
      </Box>
    </Box>
  );
}

// ── Meeting timer (server-synced) ─────────────────────────────────────────────
function MeetingTimer() {
  const theme = useTheme();
  const { room, clockOffset } = useMeetingStore();
  const [elapsed, setElapsed] = useState('00:00');

  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const serverNow = Date.now() + clockOffset;
      const secs = Math.floor((serverNow - room.createdAt) / 1000);
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      setElapsed(
        secs >= 3600
          ? `${Math.floor(secs / 3600).toString().padStart(2, '0')}:${m}:${s}`
          : `${m}:${s}`,
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [room, clockOffset]);

  return (
    <Typography sx={{
      fontSize: '0.82rem',
      color: theme.palette.text.secondary,
      fontFamily: 'monospace',
      letterSpacing: '0.08em',
    }}>
      {elapsed}
    </Typography>
  );
}