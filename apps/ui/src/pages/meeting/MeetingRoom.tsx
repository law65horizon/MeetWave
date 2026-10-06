import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Stack,
  alpha,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { Lock, VideoCall } from "@mui/icons-material";
import toast from "react-hot-toast";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/authStore";
import { useMeetingStore } from "../../store/meetingStore";
import { useMediasoup } from "../../hooks/useMediaSoup";
import { useTimeSync } from "../../hooks/useTimeSync";
import VideoGrid from "../../components/video/VideoGrid";
import MeetingControls from "../../components/meeting/MeetingControls";
import ChatPanel from "../../components/chat/ChatPanel";
import ParticipantsList from "../../components/meeting/ParticipantsList";
import WaitingRoomRequests from "../../components/meeting/WaitingRoomRequests";
import type {
  ParticipantMeta,
  ChatMessage,
  ProducerInfo,
  WaitingEntry,
  RoomMeta,
} from "../../types";
import ReactionsOverlay from "../../components/meeting/Reactionsoverlay";

type Phase = "connecting" | "waiting" | "joined" | "ended" | "error";
type AppSocket = ReturnType<typeof getSocket>;

const ERRORS: Record<string, string> = {
  ROOM_NOT_FOUND: "Room not found",
  ROOM_FULL: "Room is full",
  WRONG_PASSWORD: "Wrong password",
  UNAUTHENTICATED: "Sign in to join this meeting",
  TOKEN_EXPIRED: "Your session expired. Refresh the page and try again",
  TOKEN_INVALID: "Your session is invalid. Sign in again",
};

// Always read the store at call time. Listeners registered once at boot would
// otherwise keep a stale snapshot (e.g. localStream === null forever).
const getStore = () => useMeetingStore.getState();

export default function MeetingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { user } = useAuthStore();

  // Selectors: re-render only when these change (not on every 200ms audio level).
  const isChatOpen = useMeetingStore((s) => s.isChatOpen);
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen);
  const room = useMeetingStore((s) => s.room);
  const myRole = useMeetingStore((s) => s.myRole);
  const isMicOn = useMeetingStore((s) => s.isMicOn);
  const isCameraOn = useMeetingStore((s) => s.isCameraOn);
  const isHost = useMeetingStore((s) =>
    s.participants.some((p) => p.socketId === s.mySocketId && p.isHost),
  );

  const socketRef = useRef(getSocket());
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoProducerRef = useRef<string | null>(null);
  const audioProducerRef = useRef<string | null>(null);
  const screenProducerRef = useRef<string | null>(null);

  // Lifecycle bookkeeping
  const listenersRef = useRef<Array<[string, (...a: any[]) => void]>>([]);
  const joinedRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const pendingProducersRef = useRef<ProducerInfo[]>([]);

  const ms = useMediasoup(socketRef);
  useTimeSync(socket); // hook must tolerate null until the socket exists

  type RtpCaps = Parameters<typeof ms.loadDevice>[0];
  interface JoinRes {
    id?: string;
    error?: string;
    waiting?: boolean;
    room?: RoomMeta;
    participants?: ParticipantMeta[];
    chatHistory?: ChatMessage[];
    producers?: ProducerInfo[];
    rtpCapabilities?: RtpCaps;
  }

  // ── Theme aliases ─────────────────────────────────────────────────────────
  const primary = theme.palette.primary.main;
  const warning = theme.palette.warning.main;
  const error = theme.palette.error.main;
  const bgDefault = theme.palette.background.default;
  const bgPaper = theme.palette.background.paper;
  const textPrimary = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const divider = theme.palette.divider;
  const isDark = theme.palette.mode === "dark";

  // ── Boot / teardown: ONE effect, ONE cleanup ──────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const rid = roomId;

    // Every listener goes through here so teardown can remove exactly what we added.
    const on = (
      s: AppSocket,
      event: string,
      handler: (...a: any[]) => void,
    ) => {
      (s as any).on(event, handler);
      listenersRef.current.push([event, handler]);
    };

    async function consumeSafe(info: ProducerInfo) {
      if (info.socketId === socketRef.current?.id) return;
      const participant = getStore().participants.find(
        (p) => p.socketId === info.socketId,
      );
      try {
        await ms.consumeProducer(info, participant);
      } catch (e) {
        console.error("consumeProducer failed", e);
      }
    }

    function endSession(message: string) {
      toast.error(message);
      setErrorMsg(message);
      teardown();
      setPhase("ended");
      setTimeout(() => navigate("/"), 2000);
    }

    function registerListeners(s: AppSocket) {
      on(s, "participant:joined", (p: ParticipantMeta) => {
        if (p.socketId === s.id) return;
        const st = getStore();
        const isNew = !st.participants.some((x) => x.socketId === p.socketId);
        st.addParticipant(p);
        // Metadata only: never overwrite streams that may already be attached.
        st.setRemoteStream(p.socketId, {
          socketId: p.socketId,
          userId: p.userId,
          displayName: p.displayName,
          photoURL: p.photoURL,
          role: p.role,
          isHost: p.isHost,
        });
        // `id` makes react-hot-toast collapse any duplicate of the same event.
        if (isNew)
          toast(`${p.displayName} joined`, {
            icon: "👋",
            id: `joined-${p.socketId}`,
          });
      });

      on(
        s,
        "participant:left",
        ({
          socketId,
          displayName,
        }: {
          socketId: string;
          displayName?: string;
        }) => {
          if (socketId === s.id) return;
          const st = getStore();
          const known = st.participants.find((p) => p.socketId === socketId);
          st.removeParticipant(socketId);
          st.removeRemoteStream(socketId);
          if (st.pinnedSocketId === socketId) st.setPinnedSocketId(null);
          // Idempotent: a second "left" finds nobody and stays silent.
          if (known)
            toast(
              `${known.displayName || displayName || "A participant"} left`,
              { id: `left-${socketId}` },
            );
        },
      );

      // Queue producers that arrive while transports are still being set up.
      on(s, "new:producer", async (info: ProducerInfo) => {
        if (!mediaReadyRef.current) {
          pendingProducersRef.current.push(info);
          return;
        }
        await consumeSafe(info);
      });

      on(
        s,
        "producer:paused",
        ({
          producerId,
          socketId,
        }: {
          producerId: string;
          socketId: string;
        }) => {
          const remote = getStore().remoteStreams.get(socketId);
          if (!remote) return;
          const consumer = [...ms.consumersRef.current.values()].find(
            (c) => c.producerId === producerId,
          );
          if (!consumer) return;
          const isVideo = remote.videoStream
            ?.getTracks()
            .some((t) => t.id === consumer.track.id);
          getStore().setRemoteStream(
            socketId,
            isVideo ? { videoStream: null } : { audioStream: null },
          );
        },
      );

      on(
        s,
        "producer:resumed",
        async ({
          producerId,
          socketId,
        }: {
          producerId: string;
          socketId: string;
        }) => {
          if (!getStore().remoteStreams.has(socketId)) return;
          const consumer = [...ms.consumersRef.current.values()].find(
            (c) => c.producerId === producerId,
          );
          if (!consumer) return;
          await consumer.resume();
          const field =
            consumer.kind === "video" ? "videoStream" : "audioStream";
          getStore().setRemoteStream(socketId, {
            [field]: new MediaStream([consumer.track]),
          });
        },
      );

      // Closing ONE producer (e.g. screen share) must not delete the whole participant.
      // Participant removal is owned by 'participant:left'.
      on(
        s,
        "producer:closed",
        ({
          socketId,
          producerId,
        }: {
          socketId: string;
          producerId?: string;
        }) => {
          if (!producerId) return;
          const consumer = [...ms.consumersRef.current.values()].find(
            (c) => c.producerId === producerId,
          );
          const remote = getStore().remoteStreams.get(socketId);
          if (!consumer || !remote) return;
          const isScreen = remote.screenStream
            ?.getTracks()
            .some((t) => t.id === consumer.track.id);
          const field =
            consumer.kind === "audio"
              ? "audioStream"
              : isScreen
                ? "screenStream"
                : "videoStream";
          getStore().setRemoteStream(socketId, { [field]: null });
        },
      );

      on(
        s,
        "audio:level",
        ({ socketId, level }: { socketId: string; level: number }) => {
          // setRemoteStream CREATES missing entries. A late audio:level for someone who
          // already left would resurrect a blank/"undefined" ghost tile. Guard it.
          const st = getStore();
          if (!st.remoteStreams.has(socketId)) return;
          st.setRemoteStream(socketId, { audioLevel: level });
          if (level > 20) st.setActiveSpeaker(socketId);
        },
      );

      on(s, "chat:message", (msg: ChatMessage) => {
        const st = getStore();
        if (st.messages.some((m) => m.id === msg.id)) return;
        st.addMessage(msg);
        if (!st.isChatOpen) st.incrementUnread();
      });

      on(
        s,
        "chat:typing",
        ({
          socketId,
          displayName,
          isTyping,
        }: {
          socketId: string;
          displayName: string;
          isTyping: boolean;
        }) => {
          getStore().setTyping(socketId, displayName, isTyping);
        },
      );

      // Waiting room (host receives these on the host-only server room)
      on(s, "waiting:request", (entry: WaitingEntry) => {
        getStore().addWaiting(entry); // store de-dupes by socketId
        toast(`${entry.displayName} is waiting`, {
          icon: "🚪",
          duration: 8000,
          id: `waiting-${entry.socketId}`,
        });
      });
      on(s, "waiting:removed", ({ socketId }: { socketId: string }) =>
        getStore().removeWaiting(socketId),
      );

      // Guest side: host admitted us -> ask the server to complete the join.
      on(s, "waiting:admitted", () => joinRoom(s));
      on(s, "waiting:denied", () => {
        setErrorMsg("Host denied your request");
        setPhase("error");
      });

      on(
        s,
        "room:locked",
        ({ locked, by }: { locked: boolean; by: string }) => {
          const { room: r, setRoom } = getStore();
          if (r) setRoom({ ...r, isLocked: locked });
          toast(locked ? `Room locked by ${by}` : `Room unlocked by ${by}`, {
            icon: locked ? "🔒" : "🔓",
            id: "room-lock",
          });
        },
      );

      on(s, "room:ended", () => endSession("Meeting ended by host"));
      on(s, "room:kicked", () =>
        endSession("You were removed from the meeting"),
      );
      on(s, "room:replaced", () =>
        endSession("You joined this meeting from another tab or device"),
      );

      on(s, "host:mute-all", () => {
        handleMuteMic(true);
        toast("You were muted by the host", { icon: "🔇", id: "host-mute" });
      });
      on(s, "host:mute-you", () => {
        handleMuteMic(true);
        toast("You were muted by the host", { icon: "🔇", id: "host-mute" });
      });
      on(s, "host:disable-all-cameras", () => {
        handleMuteCamera(true);
        toast("Your camera was disabled by the host", {
          icon: "📷",
          id: "host-cam",
        });
      });
    }

    function joinRoom(s: AppSocket) {
      const password = searchParams.get("pw") || undefined;
      // No displayName here: the authenticated handshake is the single source of truth.
      s.emit("room:join", { password }, async (res: JoinRes) => {
        // if (cancelled) return;
        if (res.error) {
          setErrorMsg(ERRORS[res.error] ?? res.error);
          return setPhase("error");
        }
        if (res.waiting) return setPhase("waiting");
        try {
          await bootMedia(s, res);
        } catch (e) {
          console.error("bootMedia failed", e);
          if (cancelled) return;
          joinedRef.current = false;
          setErrorMsg("Failed to join the meeting");
          setPhase("error");
        }
      });
    }

    async function bootMedia(s: AppSocket, joinRes: JoinRes) {
      if (joinedRef.current) return; // never run the join pipeline twice
      joinedRef.current = true;

      const st = getStore();
      st.setRoom(joinRes.room || null);
      st.setParticipants(joinRes.participants || []);
      st.setMessages(joinRes.chatHistory || []);
      st.setMySocketId(s.id!);

      // Pre-populate remote entries (metadata only) so consumeProducer can merge into them.
      for (const p of joinRes.participants || []) {
        if (p.socketId === s.id) continue;
        st.setRemoteStream(p.socketId, {
          socketId: p.socketId,
          userId: p.userId,
          displayName: p.displayName,
          photoURL: p.photoURL,
          role: p.role,
          isHost: p.isHost,
        });
      }

      // Match by SOCKET id; userId is shared by two tabs of the same account.
      const me = joinRes.participants?.find((p) => p.socketId === s.id);
      st.setMyRole(me?.role || "participant");
      const canProduce = me?.role !== "viewer";

      if (joinRes.rtpCapabilities) await ms.loadDevice(joinRes.rtpCapabilities);
      if (canProduce) await ms.createSendTransport();
      await ms.createRecvTransport();
      if (cancelled) return;
      if (canProduce) await startLocalMedia(s);
      if (cancelled) return;

      const consumed = new Set<string>();
      for (const p of joinRes.producers || []) {
        consumed.add(p.producerId);
        await consumeSafe(p);
      }
      mediaReadyRef.current = true;
      for (const p of pendingProducersRef.current.splice(0)) {
        if (!consumed.has(p.producerId)) await consumeSafe(p);
      }

      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        s.emit("heartbeat");
      }, 15000);

      if (me?.isHost)
        s.emit("waiting:list", (list: WaitingEntry[]) =>
          getStore().setWaitingList(list || []),
        );

      setPhase("joined");
    }

    async function boot() {
      try {
        // `||` not `??`: an empty string must fall through. The server also falls back
        // to the account name, so a not-yet-hydrated auth store can't yield "undefined".
        const displayName =
          localStorage.getItem("displayName") || user?.name || undefined;
        const demoUserId = sessionStorage.getItem("demoUser") || undefined;
        const s = await connectSocket(rid, displayName, demoUserId);
        if (cancelled) return;
        socketRef.current = s;
        setSocket(s);

        await new Promise<void>((resolve, reject) => {
          if (s.connected) return resolve();
          const onOk = () => finish();
          const onErr = (e: Error) => finish(e);
          const timer = setTimeout(
            () => finish(new Error("Connection timeout")),
            10000,
          );
          function finish(err?: Error) {
            clearTimeout(timer);
            (s as any).off("connect", onOk);
            (s as any).off("connect_error", onErr);
            err ? reject(err) : resolve();
          }
          (s as any).on("connect", onOk);
          (s as any).on("connect_error", onErr);
        });
        if (cancelled) return;

        registerListeners(s); // before join, so no event is missed
        joinRoom(s);
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(ERRORS[e?.message] ?? "Failed to connect to server");
        setPhase("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Teardown (idempotent) ─────────────────────────────────────────────────
  function teardown() {
    const s = socketRef.current;
    for (const [event, handler] of listenersRef.current)
      (s as any)?.off(event, handler);
    listenersRef.current = [];
    pendingProducersRef.current = [];
    joinedRef.current = false;
    mediaReadyRef.current = false;

    if (audioLevelTimerRef.current) clearInterval(audioLevelTimerRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    audioLevelTimerRef.current = null;
    heartbeatRef.current = null;

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});

    const st = getStore();
    st.localStream?.getTracks().forEach((t) => t.stop());
    st.localScreenStream?.getTracks().forEach((t) => t.stop());
    ms.closeAll();
    st.reset();

    // Leaving the page must close the socket, otherwise it lingers and receives
    // (and double-handles) events for a room we no longer show.
    s?.disconnect();
  }

  // ── Local media ───────────────────────────────────────────────────────────
  async function startLocalMedia(s: AppSocket) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 1280, height: 720, frameRate: 30 },
      });
      const st = getStore();
      st.setLocalStream(stream);
      st.setMicOn(true);
      st.setCameraOn(true);

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const producer = await ms.produceTrack(audioTrack, { kind: "audio" });
        if (producer) audioProducerRef.current = producer.id;
        startAudioLevel(stream, s);
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const producer = await ms.produceTrack(videoTrack, { kind: "video" });
        if (producer) videoProducerRef.current = producer.id;
      }
    } catch {
      toast.error("Could not access camera/microphone");
    }
  }

  function startAudioLevel(stream: MediaStream, s: AppSocket) {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      if (audioLevelTimerRef.current) clearInterval(audioLevelTimerRef.current);
      audioLevelTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((sum, v) => sum + v, 0) / buf.length;
        const level = Math.min(100, Math.round(avg * 2.5));
        s.emit("audio:level", { level });
        const { mySocketId, setActiveSpeaker } = getStore();
        if (mySocketId && level > 10) setActiveSpeaker(mySocketId);
      }, 200);
    } catch {}
  }

  // ── Media controls (all read fresh state; safe to call from stale listeners) ─
  function handleMuteMic(force?: boolean) {
    const st = getStore();
    const muted = force !== undefined ? force : st.isMicOn;
    const track = st.localStream?.getAudioTracks()[0];
    if (track) track.enabled = !muted;
    st.setMicOn(!muted);
    if (audioProducerRef.current) {
      const producer = ms.producersRef.current.get(audioProducerRef.current);
      if (producer) {
        muted ? producer.pause() : producer.resume();
        socketRef.current?.emit(
          muted ? "producer:pause" : "producer:resume",
          { producerId: audioProducerRef.current },
          () => {},
        );
      }
    }
  }

  function handleMuteCamera(force?: boolean) {
    const st = getStore();
    const off = force !== undefined ? force : st.isCameraOn;
    const track = st.localStream?.getVideoTracks()[0];
    if (track) track.enabled = !off;
    st.setCameraOn(!off);
    if (videoProducerRef.current) {
      const producer = ms.producersRef.current.get(videoProducerRef.current);
      if (producer) {
        off ? producer.pause() : producer.resume();
        socketRef.current?.emit(
          off ? "producer:pause" : "producer:resume",
          { producerId: videoProducerRef.current },
          () => {},
        );
      }
    }
  }

  async function handleToggleScreen() {
    const st = getStore();
    if (st.isScreenSharing) {
      st.localScreenStream?.getTracks()[0]?.stop();
      st.setLocalScreenStream(null);
      st.setScreenSharing(false);
      if (screenProducerRef.current) {
        socketRef.current?.emit("producer:close", {
          producerId: screenProducerRef.current,
        });
        ms.producersRef.current.get(screenProducerRef.current)?.close();
        ms.producersRef.current.delete(screenProducerRef.current);
        screenProducerRef.current = null;
      }
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        const camTrack = camStream.getVideoTracks()[0];
        const local = getStore().localStream;
        local?.getVideoTracks().forEach((t) => {
          local.removeTrack(t);
          t.stop();
        });
        local?.addTrack(camTrack);
        if (!videoProducerRef.current) return;
        const producer = ms.producersRef.current.get(videoProducerRef.current);
        if (producer) await producer.replaceTrack({ track: camTrack });
      } catch {
        toast.error("Could not restore camera");
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        st.setLocalScreenStream(stream);
        st.setScreenSharing(true);
        const track = stream.getVideoTracks()[0];
        if (!videoProducerRef.current) return;
        const producer = ms.producersRef.current.get(videoProducerRef.current);
        await producer?.replaceTrack({ track });
        track.onended = () => {
          if (getStore().isScreenSharing) handleToggleScreen();
        };
      } catch {
        toast.error("Screen share cancelled");
      }
    }
  }

  function handleReaction(emoji: string) {
    socketRef.current?.emit("reaction:send", { emoji });
  }

  function handleToggleLayout() {
    const st = getStore();
    st.setLayoutMode(st.layoutMode === "grid" ? "spotlight" : "grid");
  }

  function handlePinToggle(socketId: string) {
    const st = getStore();
    st.setPinnedSocketId(st.pinnedSocketId === socketId ? null : socketId);
  }

  function handleMuteParticipant(socketId: string) {
    socketRef.current?.emit("host:mute-participant", { socketId });
  }
  function handleKickParticipant(socketId: string) {
    socketRef.current?.emit("host:kick", { socketId }, () => {});
  }

  function handleToggleLock() {
    const locked = !getStore().room?.isLocked;
    socketRef.current?.emit(
      "room:lock",
      { locked },
      (res: { error?: string }) => {
        if (res?.error) toast.error(res.error);
      },
    );
  }
  function handleMuteAll() {
    socketRef.current?.emit("host:mute-all");
  }

  function handleLeave() {
    socketRef.current?.emit("room:leave");
    teardown(); // disconnect also triggers the server's idempotent leave
    navigate("/");
  }

  function handleEndRoom() {
    const s = socketRef.current;
    if (!s) return;
    // Wait for the ack. Disconnecting immediately would make the server see a
    // disconnect before it processed room:end, and the room would never end.
    let done = false;
    const finish = (res?: { error?: string }) => {
      if (done) return;
      done = true;
      if (res?.error) toast.error(res.error);
      teardown();
      navigate("/");
    };
    s.emit("room:end", finish);
    setTimeout(() => finish(), 5000);
  }

  // Keyboard shortcuts (re-bound each render; handlers read fresh state anyway)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const st = getStore();
      const k = e.key.toLowerCase();
      if (k === "m") handleMuteMic();
      if (k === "v") handleMuteCamera();
      if (k === "c") st.setChatOpen(!st.isChatOpen);
      if (k === "p") st.setParticipantsOpen(!st.isParticipantsOpen);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canProduce = myRole !== "viewer";

  // ── Gate screens ──────────────────────────────────────────────────────────
  const gateBackground = isDark
    ? `radial-gradient(ellipse 70% 60% at 50% 0%, ${alpha(primary, 0.12)} 0%, transparent 60%)`
    : `radial-gradient(ellipse 70% 60% at 50% 0%, ${alpha(primary, 0.06)} 0%, transparent 60%)`;

  if (phase === "connecting") {
    return (
      <Box
        sx={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bgDefault,
          backgroundImage: gateBackground,
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: primary }} size={36} />
        <Typography sx={{ color: textSecondary, fontSize: "0.9rem" }}>
          Connecting to room…
        </Typography>
      </Box>
    );
  }

  if (phase === "waiting") {
    return (
      <Box
        sx={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bgDefault,
          backgroundImage: gateBackground,
          gap: 3,
          px: 3,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "16px",
            background: alpha(warning, 0.15),
            border: `1px solid ${alpha(warning, 0.3)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Lock sx={{ fontSize: 28, color: warning }} />
        </Box>
        <Stack alignItems="center" spacing={1}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: '"Sora", sans-serif',
              fontWeight: 700,
              color: textPrimary,
              textAlign: "center",
            }}
          >
            Waiting to be admitted
          </Typography>
          <Typography variant="body2" sx={{ color: textSecondary }}>
            The host will let you in shortly
          </Typography>
        </Stack>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: primary,
                animation: `bounce 1.2s ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </Box>
        <Button
          variant="outlined"
          onClick={() => {
            teardown();
            navigate("/");
          }}
          sx={{ mt: 1 }}
        >
          Leave queue
        </Button>
        <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)} }`}</style>
      </Box>
    );
  }

  if (phase === "ended" || phase === "error") {
    return (
      <Box
        sx={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bgDefault,
          backgroundImage: gateBackground,
          gap: 3,
          px: 3,
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "16px",
            background: alpha(error, 0.12),
            border: `1px solid ${alpha(error, 0.25)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          {phase === "ended" ? "👋" : "⚠️"}
        </Box>
        <Stack alignItems="center" spacing={1}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: '"Sora", sans-serif',
              fontWeight: 700,
              color: textPrimary,
            }}
          >
            {phase === "ended" ? "Meeting ended" : "Cannot join"}
          </Typography>
          <Typography variant="body2" sx={{ color: textSecondary }}>
            {errorMsg || "The meeting has ended"}
          </Typography>
        </Stack>
        <Button
          variant="contained"
          onClick={() => navigate("/")}
          startIcon={<VideoCall />}
        >
          Back to home
        </Button>
      </Box>
    );
  }

  const hasSidePanel = isChatOpen || isParticipantsOpen;
  const panelSx = {
    width: { xs: "100%", md: 320 },
    flexShrink: 0,
    m: { md: "0 8px 8px 0" },
    borderRadius: { md: "12px" },
    overflow: "hidden",
  };

  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#202124",
        overflow: "hidden",
      }}
    >
      <Typography style={{ padding: 10 }}>{room?.name}</Typography>
      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            position: "relative",
            display: { xs: hasSidePanel ? "none" : "block", md: "block" },
          }}
        >
          <VideoGrid
            localMicOn={isMicOn}
            localCameraOn={isCameraOn}
            onPinToggle={handlePinToggle}
            onMuteParticipant={handleMuteParticipant}
            onKickParticipant={handleKickParticipant}
            isHostUser={isHost}
          />
          <ReactionsOverlay socket={socketRef.current} />
          {isHost && <WaitingRoomRequests socket={socketRef.current} />}
        </Box>
        {isChatOpen && (
          <Box sx={panelSx}>
            <ChatPanel socket={socketRef.current} />
          </Box>
        )}
        {isParticipantsOpen && (
          <Box sx={{ ...panelSx, width: { xs: "100%", md: 280 } }}>
            <ParticipantsList socket={socketRef.current} isHost={isHost} />
          </Box>
        )}
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <MeetingControls
          roomId={roomId}
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
          roomMode={room?.mode || "conference"}
          canProduce={canProduce}
        />
      </Box>
    </Box>
  );
}
