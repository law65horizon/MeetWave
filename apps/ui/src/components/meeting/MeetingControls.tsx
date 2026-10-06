import { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Badge,
  ButtonBase,
  Popover,
  Stack,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  ScreenShare,
  StopScreenShare,
  Chat,
  PeopleAlt,
  EmojiEmotions,
  GridView,
  ViewSidebar,
  CallEnd,
  MoreVert,
  FiberManualRecord,
  Stop,
  Lock,
  LockOpen,
  InfoOutlined,
  ContentCopy,
  Check,
  CastForEducation,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import { useMeetingStore } from "../../store/meetingStore";
import type { RoomMode } from "../../types";

const REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🎉", "🔥", "💯"];

const C = {
  bar: "#202124",
  btn: "#3c4043",
  btnHover: "#4a4d51",
  text: "#e8eaed",
  sub: "#9aa0a6",
  accent: "#8ab4f8",
  onAccent: "#202124",
  danger: "#ea4335",
  dangerHover: "#d33426",
  paper: "#303134",
};

interface Props {
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onLeave: () => void;
  onEndRoom?: () => void;
  onToggleLock?: () => void;
  onMuteAll?: () => void;
  onReaction: (emoji: string) => void;
  onToggleLayout: () => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
  isHost: boolean;
  roomMode: RoomMode;
  canProduce: boolean;
  /** Room id from the URL; used until the server's room meta arrives. */
  roomId?: string;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Server-synced elapsed time (same math as the old MeetingTimer). */
function useElapsed() {
  const room = useMeetingStore((s) => s.room);
  const clockOffset = useMeetingStore((s) => s.clockOffset);
  const [elapsed, setElapsed] = useState("00:00");
  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const secs = Math.max(
        0,
        Math.floor((Date.now() + clockOffset - room.createdAt) / 1000),
      );
      const m = Math.floor((secs % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const s = (secs % 60).toString().padStart(2, "0");
      setElapsed(
        secs >= 3600
          ? `${Math.floor(secs / 3600)
              .toString()
              .padStart(2, "0")}:${m}:${s}`
          : `${m}:${s}`,
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [room?.createdAt, clockOffset]);
  return elapsed;
}

function useCopy(text: string, message: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!text || !(await copyText(text))) return toast.error("Could not copy");
    setCopied(true);
    toast.success(message, { id: "copied" });
    setTimeout(() => setCopied(false), 1500);
  };
  return [copied, copy] as const;
}

/** "12:04 | abc-defg-hij": tap to copy the meeting ID. */
function MeetingChip({ id }: { id: string }) {
  const elapsed = useElapsed();
  const [copied, copy] = useCopy(id, "Meeting ID copied");
  return (
    <Tooltip
      title={copied ? "Copied!" : "Click to copy meeting ID"}
      arrow
      placement="top"
    >
      <ButtonBase
        onClick={copy}
        sx={{
          gap: 1,
          px: 1.25,
          py: 0.5,
          borderRadius: "8px",
          color: C.text,
          maxWidth: "100%",
          "&:hover": { background: "rgba(255,255,255,0.08)" },
        }}
      >
        <Typography
          sx={{ fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}
        >
          {elapsed}
        </Typography>
        <Box
          sx={{ width: "1px", height: 14, background: C.sub, flexShrink: 0 }}
        />
        <Typography
          noWrap
          sx={{
            fontSize: "0.85rem",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          {id || "…"}
        </Typography>
        {copied ? (
          <Check sx={{ fontSize: 15, color: C.accent }} />
        ) : (
          <ContentCopy sx={{ fontSize: 15, color: C.sub }} />
        )}
      </ButtonBase>
    </Tooltip>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        minHeight: 28,
      }}
    >
      <Typography sx={{ fontSize: "0.8rem", color: C.sub }}>{label}</Typography>
      <Typography
        component="div"
        sx={{
          fontSize: "0.85rem",
          color: C.text,
          textAlign: "right",
          textTransform: "capitalize",
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function CopyRow({
  label,
  value,
  message,
}: {
  label: string;
  value: string;
  message: string;
}) {
  const [copied, copy] = useCopy(value, message);
  return (
    <Box>
      <Typography sx={{ fontSize: "0.75rem", color: C.sub, mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          background: C.btn,
          borderRadius: "8px",
          pl: 1.25,
          pr: 0.5,
          py: 0.25,
        }}
      >
        <Typography
          noWrap
          sx={{
            flex: 1,
            fontSize: "0.85rem",
            color: C.text,
            fontFamily: "monospace",
          }}
        >
          {value || "…"}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy"}>
          <IconButton
            size="small"
            onClick={copy}
            sx={{ color: copied ? C.accent : C.text }}
          >
            {copied ? (
              <Check fontSize="small" />
            ) : (
              <ContentCopy fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

function MeetingDetails({ meetingId }: { meetingId: string }) {
  const room = useMeetingStore((s) => s.room);
  const myRole = useMeetingStore((s) => s.myRole);
  const count = useMeetingStore((s) => s.participants.length);
  const elapsed = useElapsed();
  const link = `${window.location.origin}${window.location.pathname}`;
  const started = room?.createdAt
    ? new Date(room.createdAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "–";
  return (
    <Stack spacing={1.5} sx={{ p: 2, width: "min(340px, calc(100vw - 32px))" }}>
      <Typography sx={{ fontSize: "1rem", fontWeight: 500, color: C.text }}>
        Meeting details
      </Typography>
      {room?.name && (
        <Typography sx={{ color: C.text, fontSize: "0.95rem" }}>
          {room.name}
        </Typography>
      )}
      <CopyRow
        label="Meeting ID"
        value={meetingId}
        message="Meeting ID copied"
      />
      <CopyRow
        label="Joining link"
        value={link}
        message="Joining link copied"
      />
      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
      <Box>
        <DetailRow label="Type">
          {room?.mode === "broadcast" ? "Broadcast" : "Conference"}
        </DetailRow>
        <DetailRow label="Access">
          {room?.isLocked ? "Locked" : "Open"}
        </DetailRow>
        <DetailRow label="People">{count}</DetailRow>
        <DetailRow label="Started">{started}</DetailRow>
        <DetailRow label="Duration">{elapsed}</DetailRow>
        <DetailRow label="Your role">{myRole ?? "–"}</DetailRow>
      </Box>
    </Stack>
  );
}

function ControlBtn({
  icon,
  label,
  onClick,
  active,
  danger,
  disabled,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: any) => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const s = compact ? 40 : 48;
  const bg = danger ? C.danger : active ? C.accent : C.btn;
  const hover = danger ? C.dangerHover : active ? "#a8c7fa" : C.btnHover;
  return (
    <Tooltip title={label} arrow placement="top">
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          sx={{
            width: s,
            height: s,
            background: bg,
            transition: "background .15s",
            color: danger ? "#fff" : active ? C.onAccent : C.text,
            "&:hover": { background: hover },
            "&:disabled": { opacity: 0.4, color: C.text },
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default function MeetingControls({
  onToggleMic,
  onToggleCamera,
  onToggleScreen,
  onLeave,
  onEndRoom,
  onToggleLock,
  onMuteAll,
  onReaction,
  onToggleLayout,
  isRecording,
  onToggleRecording,
  isHost,
  roomMode,
  canProduce,
  roomId,
}: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));

  const isMicOn = useMeetingStore((s) => s.isMicOn);
  const isCameraOn = useMeetingStore((s) => s.isCameraOn);
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing);
  const isChatOpen = useMeetingStore((s) => s.isChatOpen);
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen);
  const unreadCount = useMeetingStore((s) => s.unreadCount);
  const layoutMode = useMeetingStore((s) => s.layoutMode);
  const room = useMeetingStore((s) => s.room);
  const peopleCount = useMeetingStore((s) => s.participants.length);
  const setChatOpen = useMeetingStore((s) => s.setChatOpen);
  const setParticipantsOpen = useMeetingStore((s) => s.setParticipantsOpen);

  const barRef = useRef<HTMLDivElement>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<null | HTMLElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const [infoAnchor, setInfoAnchor] = useState<null | HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);

  const meetingId = room?.roomId || roomId || "";
  const dark = {
    sx: { background: C.paper, color: C.text, borderRadius: "12px", mb: 1 },
  };

  const badgeSx = {
    "& .MuiBadge-badge": { fontSize: "0.65rem", minWidth: 16, height: 16 },
  };

  // ── Buttons (built once, placed by the layout below) ──────────────────────
  const mic = (
    <ControlBtn
      compact={compact}
      icon={isMicOn ? <Mic /> : <MicOff />}
      label={isMicOn ? "Turn off microphone" : "Turn on microphone"}
      onClick={() => onToggleMic()}
      danger={!isMicOn}
    />
  );
  const cam = (
    <ControlBtn
      compact={compact}
      icon={isCameraOn ? <Videocam /> : <VideocamOff />}
      label={isCameraOn ? "Turn off camera" : "Turn on camera"}
      onClick={() => onToggleCamera()}
      danger={!isCameraOn}
    />
  );
  const screen = (
    <ControlBtn
      compact={compact}
      icon={isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
      label={isScreenSharing ? "Stop presenting" : "Present now"}
      onClick={() => onToggleScreen()}
      active={isScreenSharing}
    />
  );
  const react = (
    <ControlBtn
      compact={compact}
      icon={<EmojiEmotions />}
      label="Send a reaction"
      onClick={(e) => setEmojiAnchor(e.currentTarget)}
      active={Boolean(emojiAnchor)}
    />
  );
  const more = (
    <ControlBtn
      compact={compact}
      icon={<MoreVert />}
      label="More options"
      onClick={(e) => setMoreAnchor(e.currentTarget)}
      active={Boolean(moreAnchor)}
    />
  );
  const info = (
    <ControlBtn
      compact={compact}
      icon={<InfoOutlined />}
      label="Meeting details"
      onClick={(e) => setInfoAnchor(compact ? barRef.current : e.currentTarget)}
      active={Boolean(infoAnchor)}
    />
  );
  const chat = (
    <Badge badgeContent={unreadCount} color="error" sx={badgeSx}>
      <ControlBtn
        compact={compact}
        icon={<Chat />}
        label="Chat"
        active={isChatOpen}
        onClick={() => {
          setChatOpen(!isChatOpen);
          if (!isChatOpen) setParticipantsOpen(false);
        }}
      />
    </Badge>
  );
  const people = (
    <Badge
      badgeContent={peopleCount}
      sx={{
        ...badgeSx,
        "& .MuiBadge-badge": {
          ...badgeSx["& .MuiBadge-badge"],
          background: C.btnHover,
          color: C.text,
        },
      }}
    >
      <ControlBtn
        compact={compact}
        icon={<PeopleAlt />}
        label="People"
        active={isParticipantsOpen}
        onClick={() => {
          setParticipantsOpen(!isParticipantsOpen);
          if (!isParticipantsOpen) setChatOpen(false);
        }}
      />
    </Badge>
  );
  const leave = (
    <Tooltip title="Leave call" arrow placement="top">
      <span>
        <IconButton
          onClick={() => {
            setLeaving(true);
            onLeave();
          }}
          disabled={leaving}
          aria-label="Leave call"
          sx={{
            width: compact ? 56 : 64,
            height: compact ? 40 : 48,
            borderRadius: "24px",
            color: "#fff",
            background: C.danger,
            "&:hover": { background: C.dangerHover },
            "&:disabled": { opacity: 0.5, color: "#fff" },
          }}
        >
          <CallEnd />
        </IconButton>
      </span>
    </Tooltip>
  );
  const viewing = (
    <Box
      sx={{
        px: 1.5,
        py: 0.9,
        borderRadius: "20px",
        background: C.btn,
        color: C.text,
        fontSize: "0.8rem",
        whiteSpace: "nowrap",
      }}
    >
      {compact ? "Viewing" : "Viewing broadcast"}
    </Box>
  );

  // ── Shared popovers / menu ────────────────────────────────────────────────
  const emojiPopover = (
    <Popover
      open={Boolean(emojiAnchor)}
      anchorEl={emojiAnchor}
      onClose={() => setEmojiAnchor(null)}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      PaperProps={dark}
    >
      <Stack direction="row" flexWrap="wrap" sx={{ maxWidth: 240, p: 1 }}>
        {REACTIONS.map((e) => (
          <IconButton
            key={e}
            onClick={() => {
              onReaction(e);
              setEmojiAnchor(null);
            }}
            sx={{
              fontSize: "1.4rem",
              width: 48,
              height: 48,
              "&:hover": { background: C.btn, transform: "scale(1.15)" },
              transition: "all .15s",
            }}
          >
            {e}
          </IconButton>
        ))}
      </Stack>
    </Popover>
  );

  const infoPopover = (
    <Popover
      open={Boolean(infoAnchor)}
      anchorEl={infoAnchor}
      onClose={() => setInfoAnchor(null)}
      anchorOrigin={{
        vertical: "top",
        horizontal: compact ? "center" : "right",
      }}
      transformOrigin={{
        vertical: "bottom",
        horizontal: compact ? "center" : "right",
      }}
      PaperProps={dark}
    >
      <MeetingDetails meetingId={meetingId} />
    </Popover>
  );

  const item = (
    icon: React.ReactNode,
    text: string,
    fn: () => void,
    color?: string,
  ) => (
    <MenuItem
      key={text}
      onClick={() => {
        fn();
        setMoreAnchor(null);
      }}
      sx={{ color: color || C.text, gap: 1.5 }}
    >
      <ListItemIcon sx={{ color: "inherit", minWidth: 0 }}>{icon}</ListItemIcon>
      {text}
    </MenuItem>
  );
  const moreMenu = (
    <Menu
      anchorEl={moreAnchor}
      open={Boolean(moreAnchor)}
      onClose={() => setMoreAnchor(null)}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      PaperProps={{ sx: { ...dark.sx, minWidth: 220 } }}
    >
      {compact &&
        canProduce &&
        item(
          isScreenSharing ? (
            <StopScreenShare fontSize="small" />
          ) : (
            <ScreenShare fontSize="small" />
          ),
          isScreenSharing ? "Stop presenting" : "Present now",
          onToggleScreen,
        )}
      {item(
        layoutMode === "spotlight" ? (
          <GridView fontSize="small" />
        ) : (
          <ViewSidebar fontSize="small" />
        ),
        layoutMode === "spotlight"
          ? "Switch to tiled layout"
          : "Switch to spotlight",
        onToggleLayout,
      )}
      {compact &&
        item(<InfoOutlined fontSize="small" />, "Meeting details", () =>
          setInfoAnchor(barRef.current),
        )}
      {onToggleRecording &&
        item(
          isRecording ? (
            <Stop fontSize="small" />
          ) : (
            <FiberManualRecord fontSize="small" />
          ),
          isRecording ? "Stop recording" : "Start recording",
          onToggleRecording,
          C.danger,
        )}
      {isHost &&
        onToggleLock &&
        item(
          room?.isLocked ? (
            <LockOpen fontSize="small" />
          ) : (
            <Lock fontSize="small" />
          ),
          room?.isLocked ? "Unlock meeting" : "Lock meeting",
          onToggleLock,
        )}
      {isHost &&
        onMuteAll &&
        item(<MicOff fontSize="small" />, "Mute everyone", onMuteAll)}
      {isHost &&
        onEndRoom &&
        item(
          <Stop fontSize="small" />,
          "End meeting for everyone",
          onEndRoom,
          "#f28b82",
        )}
    </Menu>
  );

  // ── Compact: id chip row + one row of buttons ─────────────────────────────
  if (compact) {
    return (
      <Box
        ref={barRef}
        sx={{
          background: C.bar,
          px: 1,
          pt: 0.5,
          pb: "max(10px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <MeetingChip id={meetingId} />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.75,
            width: "100%",
          }}
        >
          {canProduce ? (
            <>
              {mic}
              {cam}
            </>
          ) : (
            viewing
          )}
          {react}
          {chat}
          {people}
          {more}
          {leave}
        </Box>
        {emojiPopover}
        {infoPopover}
        {moreMenu}
      </Box>
    );
  }

  // ── Desktop: meeting info | controls | panels ─────────────────────────────
  return (
    <Box
      ref={barRef}
      sx={{
        display: "flex",
        alignItems: "center",
        height: 80,
        px: 2,
        background: C.bar,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <MeetingChip id={meetingId} />
        {roomMode === "broadcast" && (
          <Tooltip title="Broadcast meeting">
            <CastForEducation sx={{ fontSize: 18, color: C.sub }} />
          </Tooltip>
        )}
        {room?.isLocked && (
          <Tooltip title="Meeting is locked">
            <Lock sx={{ fontSize: 16, color: "#fdd663" }} />
          </Tooltip>
        )}
        {isRecording && (
          <FiberManualRecord sx={{ fontSize: 14, color: C.danger }} />
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {canProduce ? (
          <>
            {mic}
            {cam}
            {screen}
          </>
        ) : (
          viewing
        )}
        {react}
        {more}
        {leave}
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 1,
        }}
      >
        {info}
        {people}
        {chat}
      </Box>

      {emojiPopover}
      {infoPopover}
      {moreMenu}
    </Box>
  );
}
