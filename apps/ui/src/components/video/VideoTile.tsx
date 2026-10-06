import { useEffect, useRef, useState } from "react";
import { Box, Typography, Avatar, Tooltip, IconButton } from "@mui/material";
import {
  MicOff,
  PushPin,
  Star,
  ScreenShare,
  Sensors,
  PersonRemove,
} from "@mui/icons-material";
import { useMeetingStore } from "../../store/meetingStore";

interface Props {
  socketId: string;
  displayName: string;
  photoURL?: string | null;
  videoStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  /** Kept for compatibility. Remote audio is played by <RemoteAudio/> in VideoGrid. */
  audioStream?: MediaStream | null;
  audioLevel?: number;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isSpeaking?: boolean;
  isPinned?: boolean;
  role?: "host" | "broadcaster" | "viewer" | "participant";
  isScreenShare?: boolean;
  onPin?: () => void;
  onMute?: () => void;
  onKick?: () => void;
  showControls?: boolean;
  size?: "normal" | "large" | "small";
  /** cover for camera tiles in a grid, contain for pinned / presentations */
  fit?: "cover" | "contain";
}

const SPEAK = "#8ab4f8";
const AVATAR_COLORS = [
  "#1a73e8",
  "#188038",
  "#e37400",
  "#a142f4",
  "#d93025",
  "#007b83",
  "#c2185b",
  "#5f6368",
];
const colorFor = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};
// Tiles size their contents from their own box (container query units), so the same
// tile works in a 96px floating preview and a full-stage spotlight.
const CQ: any = { containerType: "size" };

const roundBtn = {
  width: 40,
  height: 40,
  color: "#fff",
  background: "rgba(32,33,36,0.85)",
  backdropFilter: "blur(6px)",
  "&:hover": { background: "rgba(60,64,67,0.95)" },
} as const;

export default function VideoTile({
  displayName,
  photoURL,
  videoStream,
  screenStream,
  isMuted,
  isCameraOff,
  isLocal,
  isHost,
  isSpeaking,
  isPinned,
  role,
  onPin,
  onMute,
  onKick,
  showControls,
  size = "normal",
  fit = "cover",
}: Props) {
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing);
  const localScreenStream = useMeetingStore((s) => s.localScreenStream);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [touchOpen, setTouchOpen] = useState(false);

  const small = size === "small";
  const sharing = !!isLocal && isScreenSharing;
  const activeStream = sharing
    ? localScreenStream
    : screenStream || videoStream;
  const showVideo = !!activeStream;
  const presenting = sharing || !!screenStream;
  const hideVideo = !!isCameraOff && !presenting;
  const showAvatar = !showVideo || hideVideo;

  // Video is always muted; sound comes from the <audio> elements in VideoGrid.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (activeStream) {
      if (video.srcObject !== activeStream) video.srcObject = activeStream;
      video.muted = true;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [activeStream, activeStream?.id, showVideo]);

  const safeName = displayName?.trim() || "Guest";
  const initial = safeName[0].toUpperCase();
  const speaking = !!isSpeaking && !isMuted;
  const hasControls = !!(onPin || onMute || onKick);

  return (
    <Box
      onClick={() => setTouchOpen((o) => !o)}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...CQ,
        borderRadius: small ? "8px" : "12px",
        overflow: "hidden",
        background:
          showVideo && !hideVideo && fit === "contain" ? "#000" : "#3c4043",
        "& .tile-controls": {
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity .15s",
          "@media (hover: none)": {
            opacity: touchOpen ? 1 : 0,
            pointerEvents: touchOpen ? "auto" : "none",
          },
        },
        "@media (hover: hover)": {
          "&:hover .tile-controls": { opacity: 1, pointerEvents: "auto" },
        },
      }}
    >
      {showVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: presenting ? "contain" : fit,
            transform: isLocal && !presenting ? "scaleX(-1)" : "none",
            display: hideVideo ? "none" : "block",
          }}
        />
      )}

      {showAvatar && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Avatar
            src={photoURL || undefined}
            sx={{
              width: "clamp(32px, 34cqmin, 112px)",
              height: "clamp(32px, 34cqmin, 112px)",
              fontSize: "clamp(14px, 15cqmin, 48px)",
              fontWeight: 500,
              bgcolor: colorFor(safeName),
              color: "#fff",
            }}
          >
            {initial}
          </Avatar>
        </Box>
      )}

      {/* Bottom scrim keeps the name readable on bright video */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "38%",
          pointerEvents: "none",
          background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
        }}
      />

      {/* Top-left chips */}
      {(presenting || role === "broadcaster") && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            px: 1,
            py: 0.3,
            borderRadius: "6px",
            background: "rgba(32,33,36,0.8)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          {presenting ? (
            <ScreenShare sx={{ fontSize: 14 }} />
          ) : (
            <Sensors sx={{ fontSize: 14, color: "#f28b82" }} />
          )}
          <Typography sx={{ fontSize: "0.7rem", fontWeight: 500 }}>
            {presenting
              ? isLocal
                ? "You are presenting"
                : "Presenting"
              : "Live"}
          </Typography>
        </Box>
      )}

      {/* Top-right: speaking bars or muted */}
      {(speaking || isMuted) && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            width: small ? 22 : 28,
            height: small ? 22 : 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            background: isMuted ? "rgba(32,33,36,0.75)" : "#1a73e8",
          }}
        >
          {isMuted ? (
            <MicOff sx={{ fontSize: small ? 13 : 16, color: "#fff" }} />
          ) : (
            [0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 3,
                  height: 12,
                  borderRadius: 2,
                  background: "#fff",
                  animation: `mw-eq 0.9s ${i * 0.15}s infinite ease-in-out`,
                }}
              />
            ))
          )}
        </Box>
      )}

      {/* Name */}
      <Box
        sx={{
          position: "absolute",
          left: small ? 8 : 12,
          bottom: small ? 6 : 10,
          maxWidth: "calc(100% - 24px)",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {isHost && <Star sx={{ fontSize: 13, color: "#fdd663" }} />}
        {isPinned && <PushPin sx={{ fontSize: 13, color: "#fff" }} />}
        <Typography
          noWrap
          sx={{
            fontSize: small ? "0.72rem" : "0.85rem",
            fontWeight: 500,
            color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          }}
        >
          {isLocal ? "You" : safeName}
        </Typography>
      </Box>

      {/* Active-speaker outline */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          zIndex: 3,
          border: speaking ? `2px solid ${SPEAK}` : "2px solid transparent",
          transition: "border-color .2s",
        }}
      />

      {/* Hover (desktop) / tap (touch) actions: pin for everyone, mute + remove for the host */}
      {(hasControls || showControls) && (
        <Box
          className="tile-controls"
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
          }}
        >
          {onPin && (
            <Tooltip title={isPinned ? "Unpin" : "Pin to screen"}>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
                sx={roundBtn}
              >
                <PushPin fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onMute && (
            <Tooltip title="Mute">
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  onMute();
                }}
                sx={roundBtn}
              >
                <MicOff fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onKick && (
            <Tooltip title="Remove from meeting">
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  onKick();
                }}
                sx={{ ...roundBtn, color: "#f28b82" }}
              >
                <PersonRemove fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}
