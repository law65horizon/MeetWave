import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box, Button, IconButton } from "@mui/material";
import {
  ChevronLeft,
  ChevronRight,
  Sensors,
  VolumeOff,
} from "@mui/icons-material";
import VideoTile from "./VideoTile";
import { useMeetingStore } from "../../store/meetingStore";
import { useAuthStore } from "../../store/authStore";
import type { RemoteStream } from "../../types";

interface Props {
  localMicOn: boolean;
  localCameraOn: boolean;
  onPinToggle: (socketId: string) => void;
  onMuteParticipant: (socketId: string) => void;
  onKickParticipant: (socketId: string) => void;
  isHostUser: boolean;
}

const GAP = 8;
const COMPACT_W = 600; // measured from the stage itself, so it works on any device/window
const WIDE = 16 / 9;
const TALL = 3 / 4;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({
        w: Math.floor(e.contentRect.width),
        h: Math.floor(e.contentRect.height),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Pick the column count that gives the largest tile of a fixed aspect ratio. */
function fitGrid(n: number, W: number, H: number, aspect: number) {
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let w = (W - GAP * (cols - 1)) / cols;
    let h = w / aspect;
    const maxH = (H - GAP * (rows - 1)) / rows;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    if (w > best.w) best = { cols, w: Math.floor(w), h: Math.floor(h) };
  }
  return best;
}

/** One hidden <audio> per remote user, mounted regardless of which page/layout is showing. */
function RemoteAudio({
  socketId,
  stream,
  onBlocked,
}: {
  socketId: string;
  stream?: MediaStream | null;
  onBlocked: (id: string, b: boolean) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = stream ?? null;
    if (!stream) {
      onBlocked(socketId, false);
      return;
    }
    const tryPlay = () =>
      a
        .play()
        .then(() => onBlocked(socketId, false))
        .catch(() => onBlocked(socketId, true));
    tryPlay();
    // Autoplay policy: the first real gesture unlocks sound.
    const evts = ["pointerdown", "pointerup", "keydown"] as const;
    evts.forEach((e) => window.addEventListener(e, tryPlay, { once: true }));
    return () => evts.forEach((e) => window.removeEventListener(e, tryPlay));
  }, [stream, socketId, onBlocked]);
  return <audio ref={ref} autoPlay playsInline style={{ display: "none" }} />;
}

const navSx = (side: "left" | "right") =>
  ({
    position: "absolute",
    top: "50%",
    [side]: 12,
    transform: "translateY(-50%)",
    zIndex: 6,
    width: 40,
    height: 40,
    color: "#fff",
    background: "rgba(60,64,67,0.9)",
    "&:hover": { background: "#4a4d51" },
    "&.Mui-disabled": { opacity: 0 },
  }) as const;

export default function VideoGrid({
  localMicOn,
  localCameraOn,
  onPinToggle,
  onMuteParticipant,
  onKickParticipant,
  isHostUser,
}: Props) {
  const localStream = useMeetingStore((s) => s.localStream);
  const remoteStreams = useMeetingStore((s) => s.remoteStreams);
  const layoutMode = useMeetingStore((s) => s.layoutMode);
  const pinnedSocketId = useMeetingStore((s) => s.pinnedSocketId);
  const activeSpeakerSocketId = useMeetingStore((s) => s.activeSpeakerSocketId);
  const mySocketId = useMeetingStore((s) => s.mySocketId);
  const myRole = useMeetingStore((s) => s.myRole);
  const room = useMeetingStore((s) => s.room);
  const participants = useMeetingStore((s) => s.participants);
  const { user } = useAuthStore();

  const [stageRef, { w: W, h: H }] = useSize<HTMLDivElement>();
  const [page, setPage] = useState(0);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const onBlocked = useCallback(
    (id: string, b: boolean) =>
      setBlocked((prev) => {
        if (prev.has(id) === b) return prev;
        const next = new Set(prev);
        b ? next.add(id) : next.delete(id);
        return next;
      }),
    [],
  );

  const remoteList = useMemo(
    () => Array.from(remoteStreams.values()),
    [remoteStreams],
  );
  const me = participants.find((p) => p.socketId === mySocketId);
  const myName = me?.displayName || user?.name || user?.email || "You";
  const myId = mySocketId || "local";
  const isViewer = myRole === "viewer";

  const compact = W > 0 && W < COMPACT_W;
  const pad = compact ? 6 : GAP;
  const innerW = Math.max(0, W - pad * 2);
  const innerH = Math.max(0, H - pad * 2);
  const perPage = compact ? 6 : 16;

  // ── Tile factories ────────────────────────────────────────────────────────
  const localTile = (
    size: "normal" | "large" | "small" = "normal",
    fit: "cover" | "contain" = "cover",
  ) => (
    <VideoTile
      socketId={myId}
      displayName={myName}
      photoURL={me?.photoURL ?? null}
      videoStream={isViewer ? null : localStream}
      isMuted={!localMicOn}
      isCameraOff={isViewer || !localCameraOn}
      isLocal
      isHost={isHostUser}
      isSpeaking={activeSpeakerSocketId === mySocketId}
      isPinned={pinnedSocketId === mySocketId}
      role={myRole || "participant"}
      onPin={() => onPinToggle(myId)}
      size={size}
      fit={fit}
    />
  );

  const remoteTile = (
    r: RemoteStream,
    size: "normal" | "large" | "small" = "normal",
    fit: "cover" | "contain" = "cover",
  ) => {
    const sid = r.socketId;
    const p = participants.find((x) => x.socketId === sid);
    const track = r.videoStream?.getVideoTracks()[0];
    return (
      <VideoTile
        socketId={sid}
        displayName={r.displayName}
        photoURL={r.photoURL}
        videoStream={r.videoStream}
        screenStream={r.screenStream}
        audioLevel={r.audioLevel}
        isMuted={!r.audioStream}
        isCameraOff={!r.videoStream || !track || !track.enabled}
        isHost={r.isHost || p?.isHost || false}
        isSpeaking={activeSpeakerSocketId === sid}
        isPinned={pinnedSocketId === sid}
        role={r.role || p?.role || "participant"}
        onPin={() => onPinToggle(sid)}
        onMute={isHostUser ? () => onMuteParticipant(sid) : undefined}
        onKick={isHostUser ? () => onKickParticipant(sid) : undefined}
        showControls={isHostUser}
        size={size}
        fit={fit}
      />
    );
  };

  const floatingSelf = (
    <Box
      sx={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 5,
        borderRadius: "12px",
        width: compact ? 96 : 224,
        height: compact ? 128 : 126,
        boxShadow: "0 2px 14px rgba(0,0,0,0.55)",
      }}
    >
      {localTile("small")}
    </Box>
  );

  // ── Which layout? ─────────────────────────────────────────────────────────
  const broadcastViewer = room?.mode === "broadcast" && isViewer;
  const presenter = remoteList.find((r) => r.screenStream);
  const focusId =
    pinnedSocketId ||
    (layoutMode === "spotlight"
      ? activeSpeakerSocketId || remoteList[0]?.socketId
      : presenter?.socketId) ||
    null;

  // Self floats when it's a 1:1 call or when remotes need several pages; otherwise it is the last tile.
  const floatSelf = remoteList.length === 1 || remoteList.length >= perPage;
  const ordered = useMemo(() => {
    const arr = [...remoteList];
    const i = arr.findIndex((r) => r.socketId === activeSpeakerSocketId);
    if (i >= perPage) {
      const [s] = arr.splice(i, 1);
      arr.splice(perPage - 1, 0, s);
    } // keep speaker on page 1
    return arr;
  }, [remoteList, activeSpeakerSocketId, perPage]);
  const pages = floatSelf
    ? Math.max(1, Math.ceil(ordered.length / perPage))
    : 1;
  const curPage = Math.min(page, pages - 1);

  let content: ReactNode = null;

  if (W === 0) {
    content = null;
  } else if (broadcastViewer) {
    const b =
      remoteList.find((r) => r.role === "broadcaster") ||
      remoteList.find((r) => r.videoStream) ||
      remoteList[0];
    content = (
      <>
        {b ? (
          <Box sx={{ position: "absolute", inset: pad }}>
            {remoteTile(b, "large", "contain")}
          </Box>
        ) : (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              color: "#9aa0a6",
              textAlign: "center",
              px: 3,
            }}
          >
            <Sensors sx={{ fontSize: 44 }} />
            <Box sx={{ fontSize: "1rem", fontWeight: 500, color: "#e8eaed" }}>
              Waiting for the broadcaster
            </Box>
            <Box sx={{ fontSize: "0.85rem" }}>
              The stream will appear when the host starts.
            </Box>
          </Box>
        )}
        {floatingSelf}
      </>
    );
  } else if (focusId !== null || layoutMode === "spotlight") {
    // Spotlight / pinned: big tile + a strip (right on wide screens, bottom on narrow ones).
    const mainRemote = focusId ? remoteStreams.get(focusId) : undefined;
    const strip = remoteList.filter((r) => r.socketId !== mainRemote?.socketId);
    const cw = compact ? 128 : 200;
    const ch = compact ? 96 : 112;
    const cell = (key: string, child: ReactNode) => (
      <Box key={key} sx={{ width: cw, height: ch, flexShrink: 0 }}>
        {child}
      </Box>
    );
    content = (
      <Box
        sx={{
          position: "absolute",
          inset: pad,
          display: "flex",
          flexDirection: compact ? "column" : "row",
          gap: `${GAP}px`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
          {mainRemote
            ? remoteTile(mainRemote, "large", "contain")
            : localTile("large", "contain")}
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: compact ? "row" : "column",
            gap: `${GAP}px`,
            flexShrink: 0,
            width: compact ? "100%" : cw,
            height: compact ? ch : "auto",
            overflowX: compact ? "auto" : "hidden",
            overflowY: compact ? "hidden" : "auto",
          }}
        >
          {mainRemote && cell("local", localTile("small"))}
          {strip.map((r) => cell(r.socketId, remoteTile(r, "small")))}
        </Box>
      </Box>
    );
  } else {
    // Tiled grid, Meet style: tiles are as large as the stage allows and the last row is centred.
    const visible = floatSelf
      ? ordered.slice(curPage * perPage, (curPage + 1) * perPage)
      : ordered;
    const count = visible.length + (floatSelf ? 0 : 1);
    const aspect = compact && H > W ? TALL : WIDE;
    const cell =
      compact && floatSelf && count === 1
        ? { cols: 1, w: innerW, h: innerH } // phone 1:1 call: remote fills the screen
        : fitGrid(count, innerW, innerH, aspect);
    const tileBox = (key: string, child: ReactNode) => (
      <Box key={key} sx={{ width: cell.w, height: cell.h }}>
        {child}
      </Box>
    );
    content = (
      <>
        <Box
          sx={{
            position: "absolute",
            inset: pad,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignContent: "center",
              gap: `${GAP}px`,
              width: cell.cols * cell.w + (cell.cols - 1) * GAP,
            }}
          >
            {visible.map((r) => tileBox(r.socketId, remoteTile(r)))}
            {!floatSelf && tileBox("local", localTile())}
          </Box>
        </Box>
        {floatSelf && floatingSelf}
        {pages > 1 && (
          <>
            <IconButton
              aria-label="Previous page"
              disabled={curPage === 0}
              onClick={() => setPage(curPage - 1)}
              sx={navSx("left")}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              aria-label="Next page"
              disabled={curPage === pages - 1}
              onClick={() => setPage(curPage + 1)}
              sx={navSx("right")}
            >
              <ChevronRight />
            </IconButton>
            <Box
              sx={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                px: 1.5,
                py: 0.25,
                borderRadius: "12px",
                fontSize: "0.75rem",
                color: "#e8eaed",
                background: "rgba(60,64,67,0.9)",
              }}
            >
              {curPage + 1} / {pages}
            </Box>
          </>
        )}
      </>
    );
  }

  return (
    <Box
      ref={stageRef}
      sx={{
        position: "absolute",
        inset: 0,
        background: "#202124",
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes mw-eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }`}</style>

      {remoteList.map((r) => (
        <RemoteAudio
          key={r.socketId}
          socketId={r.socketId}
          stream={r.audioStream}
          onBlocked={onBlocked}
        />
      ))}

      {blocked.size > 0 && (
        <Button
          variant="contained"
          size="small"
          startIcon={<VolumeOff />}
          sx={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            textTransform: "none",
          }}
        >
          Tap to turn on sound
        </Button>
      )}

      {content}
    </Box>
  );
}
