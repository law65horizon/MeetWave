import { useState } from 'react';
import {
  Box, IconButton, Tooltip, Typography, Badge, Button,
  Popover, Stack, alpha, Divider, Menu, MenuItem, ListItemIcon, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Mic, MicOff, Videocam, VideocamOff, ScreenShare, StopScreenShare,
  Chat, PeopleAlt, EmojiEmotions, GridView, ViewSidebar,
  CallEnd, MoreVert, FiberManualRecord, Stop, Lock, LockOpen,
  CastForEducation,
} from '@mui/icons-material';
import { useMeetingStore } from '../../store/meetingStore';
import type { RoomMode } from '../../types';

const REACTIONS = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🔥', '💯'];

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
}

function ControlBtn({
  icon, label, onClick, active, danger, disabled, size = 'normal',
}: {
  icon: React.ReactNode; label: string; onClick: (e: any) => void;
  active?: boolean; danger?: boolean; disabled?: boolean;
  size?: 'normal' | 'small';
}) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const primaryLight = theme.palette.primary.light;
  const errorColor = theme.palette.error.main;
  const isDark = theme.palette.mode === 'dark';

  const btnSize = size === 'small' ? 40 : 48;

  return (
    <Tooltip title={label} arrow placement="top">
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          sx={{
            width: btnSize, height: btnSize,
            borderRadius: size === 'small' ? '10px' : '12px',
            background: danger
              ? alpha(errorColor, 0.15)
              : active
                ? alpha(primary, isDark ? 0.2 : 0.12)
                : isDark ? 'rgba(255,255,255,0.07)' : alpha(theme.palette.text.primary, 0.05),
            color: danger
              ? errorColor
              : active
                ? isDark ? primaryLight : primary
                : theme.palette.text.secondary,
            border: danger
              ? `1px solid ${alpha(errorColor, 0.3)}`
              : active
                ? `1px solid ${alpha(primary, 0.35)}`
                : `1px solid ${theme.palette.divider}`,
            transition: 'all 0.15s',
            '&:hover': {
              background: danger
                ? alpha(errorColor, 0.25)
                : active
                  ? alpha(primary, isDark ? 0.3 : 0.18)
                  : isDark ? 'rgba(255,255,255,0.12)' : alpha(theme.palette.text.primary, 0.09),
              transform: 'translateY(-1px)',
            },
            '&:disabled': { opacity: 0.35 },
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default function MeetingControls({
  onToggleMic, onToggleCamera, onToggleScreen, onLeave, onEndRoom,
  onToggleLock, onMuteAll, onReaction, onToggleLayout,
  isRecording, onToggleRecording, isHost, roomMode, canProduce,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';

  const primary    = theme.palette.primary.main;
  const error      = theme.palette.error.main;
  const secondary  = theme.palette.secondary.main;
  const warning    = theme.palette.warning.main;
  const textPrimary    = theme.palette.text.primary;
  const textSecondary  = theme.palette.text.secondary;
  const divider    = theme.palette.divider;
  const bgPaper    = theme.palette.background.paper;

  const {
    isMicOn, isCameraOn, isScreenSharing, isChatOpen, isParticipantsOpen,
    unreadCount, layoutMode, room, participants,
    setChatOpen, setParticipantsOpen,
  } = useMeetingStore();

  const [emojiAnchor, setEmojiAnchor] = useState<null | HTMLElement>(null);
  const [moreAnchor, setMoreAnchor]   = useState<null | HTMLElement>(null);
  const [leaving, setLeaving]         = useState(false);

  async function handleLeave() {
    setLeaving(true);
    onLeave();
  }

  // console.log({isChatOpen})

  const barBg = isDark ? 'rgba(8,10,14,0.9)' : alpha(bgPaper, 0.92);

  // ── Shared popovers/menus (rendered once, outside both layouts) ───────────
  const emojiPopover = (
    <Popover
      open={Boolean(emojiAnchor)}
      anchorEl={emojiAnchor}
      onClose={() => setEmojiAnchor(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      PaperProps={{
        sx: {
          mb: 1, p: 1.5, borderRadius: '14px',
          background: isDark ? 'rgba(15,17,23,0.95)' : bgPaper,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${divider}`,
        },
      }}
    >
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ maxWidth: 240 }}>
        {REACTIONS.map((e) => (
          <IconButton
            key={e} size="small"
            onClick={() => { onReaction(e); setEmojiAnchor(null); }}
            sx={{
              fontSize: '1.4rem', width: 40, height: 40, borderRadius: '10px',
              '&:hover': { background: alpha(primary, 0.1), transform: 'scale(1.2)' },
              transition: 'all 0.15s',
            }}
          >
            {e}
          </IconButton>
        ))}
      </Stack>
    </Popover>
  );

  const moreMenu = (
    <Menu
      anchorEl={moreAnchor}
      open={Boolean(moreAnchor)}
      onClose={() => setMoreAnchor(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      PaperProps={{ sx: { mb: 1, minWidth: 200 } }}
    >
      {isMobile && canProduce && (
        <MenuItem onClick={() => { onToggleScreen(); setMoreAnchor(null); }}>
          <ListItemIcon>
            {isScreenSharing
              ? <StopScreenShare fontSize="small" sx={{ color: primary }} />
              : <ScreenShare fontSize="small" />}
          </ListItemIcon>
          {isScreenSharing ? 'Stop screen share' : 'Share screen'}
        </MenuItem>
      )}
      {isMobile && (
        <MenuItem onClick={() => { onToggleLayout(); setMoreAnchor(null); }}>
          <ListItemIcon>
            {layoutMode === 'spotlight' ? <GridView fontSize="small" /> : <ViewSidebar fontSize="small" />}
          </ListItemIcon>
          Toggle layout
        </MenuItem>
      )}
      {onToggleRecording && (
        <MenuItem onClick={() => { onToggleRecording(); setMoreAnchor(null); }}>
          <ListItemIcon>
            {isRecording
              ? <Stop fontSize="small" sx={{ color: error }} />
              : <FiberManualRecord fontSize="small" sx={{ color: error }} />}
          </ListItemIcon>
          {isRecording ? 'Stop recording' : 'Start recording'}
        </MenuItem>
      )}
      {isHost && onToggleLock && (
        <MenuItem onClick={() => { onToggleLock(); setMoreAnchor(null); }}>
          <ListItemIcon>
            {room?.isLocked ? <LockOpen fontSize="small" /> : <Lock fontSize="small" />}
          </ListItemIcon>
          {room?.isLocked ? 'Unlock room' : 'Lock room'}
        </MenuItem>
      )}
      {isHost && onMuteAll && (
        <MenuItem onClick={() => { onMuteAll(); setMoreAnchor(null); }}>
          <ListItemIcon><MicOff fontSize="small" /></ListItemIcon>
          Mute everyone
        </MenuItem>
      )}
    </Menu>
  );

  // ── Mobile layout: two clean rows ─────────────────────────────────────────
  if (isMobile) {
    return (
      <Box sx={{
        background: barBg, backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${divider}`,
        px: 1.5, pt: 1, pb: 1.5,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        {/* Row 1 — sidebar toggles + leave (right-aligned) */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          {canProduce ? (
            <>
              <ControlBtn
                icon={isMicOn ? <Mic /> : <MicOff />}
                label={isMicOn ? 'Mute mic' : 'Unmute mic'}
                onClick={() => onToggleMic()}
                active={isMicOn} danger={!isMicOn} size="small"
              />
              <ControlBtn
                icon={isCameraOn ? <Videocam /> : <VideocamOff />}
                label={isCameraOn ? 'Stop camera' : 'Start camera'}
                onClick={() => onToggleCamera()}
                active={isCameraOn} danger={!isCameraOn} size="small"
              />
            </>
          ) : (
            <Box sx={{
              px: 2, py: 0.8, borderRadius: '10px',
              background: alpha(secondary, 0.1),
              border: `1px solid ${alpha(secondary, 0.2)}`,
            }}>
              <Typography sx={{ fontSize: '0.78rem', color: secondary, fontWeight: 600 }}>👁 Viewing</Typography>
            </Box>
          )}
          <Badge
            badgeContent={unreadCount} color="error"
            sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 16, height: 16 } }}
          >
            <ControlBtn
              icon={<Chat />} label="Chat" size="small"
              onClick={() => { setChatOpen(!isChatOpen); if (!isChatOpen) setParticipantsOpen(false); }}
              active={isChatOpen}
            />
          </Badge>

          <Badge
            badgeContent={participants.length}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.65rem', minWidth: 16, height: 16,
                background: alpha(primary, 0.3), color: theme.palette.primary.light,
                border: `1px solid ${alpha(primary, 0.5)}`,
              },
            }}
          >
            <ControlBtn
              icon={<PeopleAlt />} label="Participants" size="small"
              onClick={() => { setParticipantsOpen(!isParticipantsOpen); if (!isParticipantsOpen) setChatOpen(false); }}
              active={isParticipantsOpen}
            />
          </Badge>

          <Tooltip title="More options" arrow placement="top">
            <IconButton
              onClick={(e) => setMoreAnchor(e.currentTarget)}
              sx={{
                width: 40, height: 40, borderRadius: '10px',
                background: isDark ? 'rgba(255,255,255,0.07)' : alpha(textPrimary, 0.05),
                border: `1px solid ${divider}`, color: textSecondary,
                '&:hover': { background: isDark ? 'rgba(255,255,255,0.12)' : alpha(textPrimary, 0.09) },
              }}
            >
              <MoreVert />
            </IconButton>
          </Tooltip>

          
        </Box>

        {/* Row 2 — main media controls (centered) */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          

          <ControlBtn
            icon={<EmojiEmotions />} label="React" size="small"
            onClick={(e: React.MouseEvent<HTMLElement>) => setEmojiAnchor(e.currentTarget as HTMLElement)}
            active={Boolean(emojiAnchor)}
          />

          
          {/* Leave button */}
          <IconButton
            onClick={handleLeave}
            disabled={leaving}
            sx={{
              width: 40, height: 40, borderRadius: '10px',
              background: alpha(error, 0.85),
              color: '#fff',
              border: `1px solid ${alpha(error, 0.5)}`,
              boxShadow: `0 4px 12px ${alpha(error, 0.35)}`,
              '&:hover': { background: '#DC2626' },
              '&:disabled': { opacity: 0.5 },
            }}
          >
            <CallEnd fontSize="small" />
          </IconButton>

          {isHost && onEndRoom && (
            <Tooltip title="End meeting for all" arrow>
              <IconButton
                onClick={onEndRoom}
                sx={{
                  width: 40, height: 40, borderRadius: '10px',
                  background: alpha(error, 0.15), color: error,
                  border: `1px solid ${alpha(error, 0.3)}`,
                  '&:hover': { background: alpha(error, 0.25) },
                }}
              >
                <Stop fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {emojiPopover}
        {moreMenu}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </Box>
    );
  }

  // ── Desktop layout: single row, three sections ───────────────────────────
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      px: { sm: 2, md: 3 }, py: 2,
      background: barBg, backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${divider}`,
    }}>
      {/* Left: room info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: { sm: 140, md: 180 } }}>
        <Box>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: textPrimary, lineHeight: 1.2 }}>
            {room?.name || room?.roomId}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.2, flexWrap: 'wrap' }}>
            {roomMode === 'broadcast' && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.4,
                background: alpha(secondary, 0.12),
                border: `1px solid ${alpha(secondary, 0.25)}`,
                borderRadius: '5px', px: 0.8, py: 0.1,
              }}>
                <CastForEducation sx={{ fontSize: 10, color: secondary }} />
                <Typography sx={{ fontSize: '0.62rem', color: secondary, fontWeight: 700 }}>BROADCAST</Typography>
              </Box>
            )}
            {room?.isLocked && <Lock sx={{ fontSize: 12, color: warning }} />}
            <Typography sx={{ fontSize: '0.72rem', color: textSecondary }}>
              {participants.length} {participants.length === 1 ? 'person' : 'people'}
            </Typography>
          </Box>
        </Box>
        {isRecording && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            background: alpha(error, 0.12), border: `1px solid ${alpha(error, 0.25)}`,
            borderRadius: '6px', px: 1, py: 0.4,
          }}>
            <FiberManualRecord sx={{ fontSize: 10, color: error, animation: 'pulse 1.5s infinite' }} />
            <Typography sx={{ fontSize: '0.7rem', color: error, fontWeight: 700 }}>REC</Typography>
          </Box>
        )}
      </Box>

      {/* Center: main controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {canProduce ? (
          <>
            <ControlBtn
              icon={isMicOn ? <Mic /> : <MicOff />}
              label={isMicOn ? 'Mute mic' : 'Unmute mic'}
              onClick={() => onToggleMic()}
              active={isMicOn} danger={!isMicOn}
            />
            <ControlBtn
              icon={isCameraOn ? <Videocam /> : <VideocamOff />}
              label={isCameraOn ? 'Stop camera' : 'Start camera'}
              onClick={() => onToggleCamera()}
              active={isCameraOn} danger={!isCameraOn}
            />
            <ControlBtn
              icon={isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
              label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              onClick={() => onToggleScreen()}
              active={isScreenSharing}
            />
          </>
        ) : (
          <Box sx={{
            px: 2, py: 1, borderRadius: '10px',
            background: alpha(secondary, 0.1), border: `1px solid ${alpha(secondary, 0.2)}`,
          }}>
            <Typography sx={{ fontSize: '0.8rem', color: secondary, fontWeight: 600 }}>
              👁 Viewing broadcast
            </Typography>
          </Box>
        )}

        <Box sx={{ width: 1, height: 32, background: divider, mx: 0.5 }} />

        <ControlBtn
          icon={<EmojiEmotions />} label="React"
          onClick={(e: React.MouseEvent<HTMLElement>) => setEmojiAnchor(e.currentTarget as HTMLElement)}
          active={Boolean(emojiAnchor)}
        />

        <ControlBtn
          icon={layoutMode === 'spotlight' ? <GridView /> : <ViewSidebar />}
          label="Toggle layout"
          onClick={onToggleLayout}
        />

        <Tooltip title="More options" arrow placement="top">
          <IconButton
            onClick={(e) => setMoreAnchor(e.currentTarget)}
            sx={{
              width: 48, height: 48, borderRadius: '12px',
              background: isDark ? 'rgba(255,255,255,0.07)' : alpha(textPrimary, 0.05),
              border: `1px solid ${divider}`, color: textSecondary,
              '&:hover': { background: isDark ? 'rgba(255,255,255,0.12)' : alpha(textPrimary, 0.09) },
            }}
          >
            <MoreVert />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Right: sidebar toggles + leave */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: { sm: 140, md: 180 }, justifyContent: 'flex-end' }}>
        <Badge
          badgeContent={unreadCount} color="error"
          sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 16, height: 16 } }}
        >
          <ControlBtn
            icon={<Chat />} label="Chat"
            onClick={() => { setChatOpen(!isChatOpen); if (!isChatOpen) setParticipantsOpen(false); }}
            active={isChatOpen}
          />
        </Badge>

        <Badge
          badgeContent={participants.length}
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '0.65rem', minWidth: 16, height: 16,
              background: alpha(primary, 0.3), color: theme.palette.primary.light,
              border: `1px solid ${alpha(primary, 0.5)}`,
            },
          }}
        >
          <ControlBtn
            icon={<PeopleAlt />} label="Participants"
            onClick={() => { setParticipantsOpen(!isParticipantsOpen); if (!isParticipantsOpen) setChatOpen(false); }}
            active={isParticipantsOpen}
          />
        </Badge>

        <Button
          variant="contained"
          startIcon={<CallEnd />}
          onClick={handleLeave}
          disabled={leaving}
          sx={{
            background: alpha(error, 0.85), ml: 1, px: 2.5, py: 1.1,
            fontWeight: 700, fontSize: '0.875rem',
            boxShadow: `0 4px 16px ${alpha(error, 0.35)}`,
            '&:hover': { background: '#DC2626', boxShadow: `0 6px 20px ${alpha(error, 0.45)}` },
          }}
        >
          Leave
        </Button>

        {isHost && onEndRoom && (
          <Tooltip title="End meeting for all" arrow>
            <IconButton
              onClick={onEndRoom}
              sx={{
                width: 40, height: 40, borderRadius: '10px',
                background: alpha(error, 0.15), color: error,
                border: `1px solid ${alpha(error, 0.3)}`,
                '&:hover': { background: alpha(error, 0.25) },
              }}
            >
              <Stop fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {emojiPopover}
      {moreMenu}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </Box>
  );
}