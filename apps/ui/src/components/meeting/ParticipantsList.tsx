import {
  Box, Typography, IconButton, Avatar, Stack,
  Tooltip, Chip, alpha, useTheme,
} from '@mui/material';
import { Close, Mic, MicOff, Videocam, VideocamOff, Star, Remove, ScreenShare } from '@mui/icons-material';
import { useMeetingStore } from '../../store/meetingStore';
import type { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  isHost: boolean;
}

export default function ParticipantsList({ socket, isHost }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary   = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const error     = theme.palette.error.main;
  const warning   = theme.palette.warning.main;
  const textPrimary   = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const divider   = theme.palette.divider;
  const bgDefault = theme.palette.background.default;
  const bgPaper   = theme.palette.background.paper;

  const { participants, remoteStreams, isMicOn, isCameraOn, activeSpeakerSocketId, mySocketId, setParticipantsOpen } = useMeetingStore();

  function handleMute(socketId: string) { socket?.emit('host:mute-participant', { socketId }); }
  function handleKick(socketId: string) { socket?.emit('host:kick', { socketId }, () => {}); }

  const sorted = [...participants].sort((a, b) => {
    if (a.isHost) return -1;
    if (b.isHost) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <Box sx={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: isDark ? 'rgba(8,10,14,0.95)' : alpha(bgPaper, 0.97),
      backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${divider}`,
    }}>
      {/* Header */}
      <Box sx={{
        px: 2.5, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${divider}`,
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontFamily: '"Sora", sans-serif', fontWeight: 600,
          fontSize: '0.95rem', color: textPrimary,
        }}>
          Participants
          <Typography component="span" sx={{ color: textSecondary, fontSize: '0.8rem', ml: 1 }}>
            ({participants.length})
          </Typography>
        </Typography>
        <IconButton size="small" onClick={() => setParticipantsOpen(false)} sx={{ color: textSecondary }}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1.5 }}>
        <Stack spacing={0.5}>
          {sorted.map((p) => {
            const remote = remoteStreams.get(p.socketId);
            const isMe = p.socketId === mySocketId;
            const isSpeaking = activeSpeakerSocketId === p.socketId;
            const hasVideo = (isMe && isCameraOn) ? true : Boolean(remote?.videoStream?.active);
            const hasAudio = (isMe && isMicOn) ? true : Boolean(remote?.audioStream?.active);
            const isSharing = Boolean(remote?.screenStream);

            return (
              <Box
                key={p.socketId}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 1.5, py: 1, borderRadius: '10px',
                  background: isSpeaking
                    ? alpha(primary, isDark ? 0.08 : 0.06)
                    : 'transparent',
                  border: isSpeaking
                    ? `1px solid ${alpha(primary, 0.22)}`
                    : '1px solid transparent',
                  transition: 'all 0.2s',
                  '&:hover .p-actions': { opacity: isHost && !isMe ? 1 : 0 },
                  '&:hover': {
                    background: isSpeaking
                      ? alpha(primary, isDark ? 0.1 : 0.07)
                      : alpha(primary, isDark ? 0.04 : 0.03),
                  },
                }}
              >
                {/* Avatar */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar
                    src={p.photoURL || undefined}
                    sx={{
                      width: 34, height: 34, fontSize: '0.8rem',
                      border: isSpeaking
                        ? `2px solid ${primary}`
                        : '2px solid transparent',
                      background: p.role === 'broadcaster'
                        ? `linear-gradient(135deg, ${secondary}, #059669)`
                        : undefined,
                    }}
                  >
                    {p.displayName.slice(0, 2).toUpperCase()}
                  </Avatar>
                  {isSpeaking && (
                    <Box sx={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 10, height: 10, borderRadius: '50%',
                      background: secondary,
                      border: `1.5px solid ${isDark ? '#080A0E' : bgPaper}`,
                    }} />
                  )}
                </Box>

                {/* Name + role */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{
                      fontSize: '0.82rem', fontWeight: 600,
                      color: textPrimary,
                      overflow: 'hidden', whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis', maxWidth: 110,
                    }}>
                      {p.displayName}{isMe ? ' (you)' : ''}
                    </Typography>
                    {p.isHost && <Star sx={{ fontSize: 11, color: warning }} />}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                    <Chip
                      label={p.role}
                      size="small"
                      sx={{
                        height: 16, fontSize: '0.6rem', fontWeight: 700,
                        background: p.role === 'broadcaster'
                          ? alpha(secondary, isDark ? 0.15 : 0.1)
                          : alpha(primary, isDark ? 0.12 : 0.08),
                        color: p.role === 'broadcaster' ? secondary : theme.palette.primary.light,
                        border: `1px solid ${p.role === 'broadcaster'
                          ? alpha(secondary, 0.25)
                          : alpha(primary, 0.25)}`,
                        '& .MuiChip-label': { px: 0.8 },
                      }}
                    />
                    {isSharing && <ScreenShare sx={{ fontSize: 11, color: secondary }} />}
                  </Box>
                </Box>

                {/* Media status icons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {hasAudio
                    ? <Mic sx={{ fontSize: 14, color: textSecondary }} />
                    : <MicOff sx={{ fontSize: 14, color: error }} />
                  }
                  {hasVideo
                    ? <Videocam sx={{ fontSize: 14, color: textSecondary }} />
                    : <VideocamOff sx={{ fontSize: 14, color: error }} />
                  }
                </Box>

                {/* Host actions */}
                {isHost && !isMe && (
                  <Box className="p-actions" sx={{ display: 'flex', gap: 0.3, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
                    <Tooltip title="Mute">
                      <IconButton
                        size="small"
                        onClick={() => handleMute(p.socketId)}
                        sx={{ color: textSecondary, '&:hover': { color: warning } }}
                      >
                        <MicOff sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        onClick={() => handleKick(p.socketId)}
                        sx={{ color: textSecondary, '&:hover': { color: error } }}
                      >
                        <Remove sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}