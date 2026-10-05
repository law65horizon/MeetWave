import { useEffect, useRef } from 'react';
import { Box, Typography, Avatar, Tooltip, IconButton, alpha, Chip } from '@mui/material';
import {
  MicOff, PushPin, Star, MoreVert,
  ScreenShare, CastForEducation,
} from '@mui/icons-material';
import { useMeetingStore } from '../../store/meetingStore';

interface Props {
  socketId: string;
  displayName: string;
  photoURL?: string | null;
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  audioLevel?: number;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isSpeaking?: boolean;
  isPinned?: boolean;
  role?: 'host' | 'broadcaster' | 'viewer' | 'participant';
  isScreenShare?: boolean;
  onPin?: () => void;
  onMute?: () => void;
  onKick?: () => void;
  showControls?: boolean;
  size?: 'normal' | 'large' | 'small';
}

export default function VideoTile({
  socketId, displayName, photoURL, videoStream, audioStream,
  audioLevel = 0, isMuted, isCameraOff, isLocal, isHost, isSpeaking,
  isPinned, role, isScreenShare, onPin, onMute, onKick, showControls, size = 'normal',
}: Props) {
  const isScreenSharing = useMeetingStore((s) => s.isScreenSharing)
  const localScreenStream = useMeetingStore((s) => s.localScreenStream)
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const activeStream = isScreenSharing ? localScreenStream : videoStream;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (activeStream) {
      if (video.srcObject !== activeStream) video.srcObject = activeStream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
    // if (!isLocal) {
      console.log({isLocal, isHost, vidEnabled: activeStream?.getVideoTracks()[0].enabled, vidLength: activeStream?.getVideoTracks().length})
    // }
  }, [activeStream, activeStream?.id]);

  useEffect(() => {
    if (audioRef.current && audioStream && !isLocal) {
      audioRef.current.srcObject = audioStream;
    }
  }, [audioStream, isLocal]);

  const initials = displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  // const showVideo = activeStream && !isCameraOff;
  const showVideo = !!activeStream
  const speakingGlow = isSpeaking && !isMuted;
  const glowColor = role === 'broadcaster' ? '#10B981' : '#6366F1';

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%', // 16:9
        borderRadius: size === 'small' ? '10px' : '14px',
        overflow: 'hidden',
        background: '#0D0F14',
        border: speakingGlow
          ? `2px solid ${glowColor}`
          : '2px solid rgba(255,255,255,0.06)',
        boxShadow: speakingGlow
          ? `0 0 0 3px ${alpha(glowColor, 0.2)}, 0 8px 32px rgba(0,0,0,0.5)`
          : '0 4px 20px rgba(0,0,0,0.4)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover .tile-controls': { opacity: 1 },
        flexShrink: 0,
      }}
    >
      {/* Audio (hidden) */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />}

      {/* Video */}
      {showVideo && (
        <video
          ref={videoRef}
          autoPlay playsInline muted={isLocal}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            transform: isLocal && !isScreenShare ? 'scaleX(-1)' : 'none',
            display: isCameraOff ? 'none': 'block'
          }}
        />
      )}

      {/* Avatar fallback */}
      {isCameraOff && (
        <Box sx={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(circle at 50% 40%, ${alpha('#6366F1', 0.15)} 0%, #0D0F14 70%)`,
        }}>
          <Avatar
            src={photoURL || undefined}
            sx={{
              width: size === 'small' ? 44 : size === 'large' ? 80 : 60,
              height: size === 'small' ? 44 : size === 'large' ? 80 : 60,
              fontSize: size === 'small' ? '1rem' : size === 'large' ? '2rem' : '1.5rem',
              border: `2px solid ${alpha(glowColor, 0.4)}`,
              boxShadow: speakingGlow ? `0 0 20px ${alpha(glowColor, 0.4)}` : 'none',
              background: `linear-gradient(135deg, ${glowColor}66, #8B5CF666)`,
            }}
          >
            {initials}
          </Avatar>
        </Box>
      )}

      {/* Screen share label */}
      {isScreenShare && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8,
          background: alpha('#10B981', 0.15),
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '6px', px: 1, py: 0.3,
          display: 'flex', alignItems: 'center', gap: 0.5,
        }}>
          <ScreenShare sx={{ fontSize: 12, color: '#10B981' }} />
          <Typography sx={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 600 }}>Screen</Typography>
        </Box>
      )}

      {/* Broadcast badge */}
      {role === 'broadcaster' && !isScreenShare && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8,
          background: alpha('#10B981', 0.15),
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '6px', px: 1, py: 0.3,
          display: 'flex', alignItems: 'center', gap: 0.5,
        }}>
          <CastForEducation sx={{ fontSize: 12, color: '#10B981' }} />
          <Typography sx={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 600 }}>LIVE</Typography>
        </Box>
      )}

      {/* Audio level bar */}
      {speakingGlow && audioLevel > 5 && (
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${glowColor} ${audioLevel}%, transparent ${audioLevel}%)`,
          opacity: 0.8, transition: 'background 0.1s',
        }} />
      )}

      {/* Name badge */}
      <Box sx={{
        position: 'absolute', bottom: 8, left: 8,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)',
        borderRadius: '8px', px: 1, py: 0.4,
        display: 'flex', alignItems: 'center', gap: 0.7,
        maxWidth: 'calc(100% - 48px)',
      }}>
        {isHost && <Star sx={{ fontSize: 11, color: '#F59E0B' }} />}
        {isPinned && <PushPin sx={{ fontSize: 11, color: '#6366F1' }} />}
        <Typography sx={{
          fontSize: size === 'small' ? '0.68rem' : '0.75rem',
          fontWeight: 600, color: '#F1F5F9', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
        }}>
          {displayName}{isLocal ? ' (you)' : ''}
        </Typography>
      </Box>

      {/* Muted indicator */}
      {isMuted && (
        <Box sx={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(239,68,68,0.85)', backdropFilter: 'blur(8px)',
          borderRadius: '6px', p: 0.4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MicOff sx={{ fontSize: 12, color: '#fff' }} />
        </Box>
      )}

      {/* Host controls overlay */}
      {showControls && (
        <Box
          className="tile-controls"
          sx={{
            position: 'absolute', inset: 0, opacity: 0,
            transition: 'opacity 0.15s',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          }}
        >
          {onPin && (
            <Tooltip title={isPinned ? 'Unpin' : 'Pin'}>
              <IconButton size="small" onClick={onPin} sx={{ background: 'rgba(255,255,255,0.1)' }}>
                <PushPin fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onMute && (
            <Tooltip title="Mute">
              <IconButton size="small" onClick={onMute} sx={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                <MicOff fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onKick && (
            <Tooltip title="Remove">
              <IconButton size="small" onClick={onKick} sx={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}