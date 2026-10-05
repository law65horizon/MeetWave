import { Box } from '@mui/material';
import VideoTile from './VideoTile';
import { useMeetingStore } from '../../store/meetingStore';
import type { RemoteStream } from '../../types';
import { useAuthStore } from '../../store/authStore';

interface LocalParticipant {
  socketId: string;
  displayName: string;
  photoURL?: string | null;
  isLocal: true;
  stream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isHost: boolean;
  role: 'host' | 'broadcaster' | 'viewer' | 'participant';
}

interface Props {
  localMicOn: boolean;
  localCameraOn: boolean;
  onPinToggle: (socketId: string) => void;
  onMuteParticipant: (socketId: string) => void;
  onKickParticipant: (socketId: string) => void;
  isHostUser: boolean;
}

export default function VideoGrid({
  localMicOn, localCameraOn, onPinToggle,
  onMuteParticipant, onKickParticipant, isHostUser,
}: Props) {
  const {
    localStream, remoteStreams, layoutMode, pinnedSocketId, localScreenStream,
    activeSpeakerSocketId, mySocketId, myRole, room, participants, isScreenSharing
  } = useMeetingStore();
  const { user } = useAuthStore();

  const displayName = user?.name || user?.email || 'You';
  const photoURL = '';
  // Build tile list
  const remoteTiles = Array.from(remoteStreams.values());
  // const remoteTiles = createMockRemoteStreams(100)
  const localParticipant = participants.find((p) => p.socketId === mySocketId);

  function getTileProps(sid: string, remote: RemoteStream) {
    const participant = participants.find((p) => p.socketId === sid);
    return {
      socketId: sid,
      displayName: remote.displayName,
      photoURL: remote.photoURL,
      videoStream: remote.videoStream,
      audioStream: remote.audioStream,
      audioLevel: remote.audioLevel,
      isMuted: !remote.audioStream,
      isCameraOff: !remote.videoStream || remote.videoStream.getVideoTracks().length === 0 || !remote.videoStream.getVideoTracks()[0].enabled,
      isHost: remote.isHost || participant?.isHost || false,
      isSpeaking: activeSpeakerSocketId === sid,
      isPinned: pinnedSocketId === sid,
      role: remote.role || participant?.role || 'participant',
      onPin: () => onPinToggle(sid),
      onMute: isHostUser ? () => onMuteParticipant(sid) : undefined,
      onKick: isHostUser ? () => onKickParticipant(sid) : undefined,
      showControls: isHostUser,
    };
  }

  // Spotlight / pinned mode
  if (layoutMode === 'spotlight' || pinnedSocketId) {
    const pinnedSid = pinnedSocketId || activeSpeakerSocketId || remoteTiles[0]?.socketId;
    const pinnedRemote = pinnedSid ? remoteStreams.get(pinnedSid) : null;
    const others = remoteTiles.filter((r) => r.socketId !== pinnedSid);

    return (
      <Box sx={{ display: 'flex', gap: 1.5, height: '100%', p: 1.5 }}>
        {/* Main */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {pinnedRemote ? (
            <VideoTile {...getTileProps(pinnedSid!, pinnedRemote)} size="large" />
          ) : (
            <VideoTile
              socketId={mySocketId || 'local'}
              displayName={displayName}
              photoURL={photoURL}
              videoStream={localStream}
              isMuted={!localMicOn}
              screenStream={localScreenStream}
              isScreenShare={isScreenSharing}
              isCameraOff={!localCameraOn}
              isLocal isHost={isHostUser}
              isSpeaking={activeSpeakerSocketId === mySocketId}
              isPinned={pinnedSocketId === mySocketId}
              role={myRole || 'participant'}
              onPin={() => onPinToggle(mySocketId || 'local')}
              size="large"
            />
          )}
        </Box>
        {/* Strip */}
        <Box sx={{ width: 160, display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {pinnedSid !== mySocketId && (
            <VideoTile
              socketId={mySocketId || 'local'}
              displayName={displayName}
              photoURL={photoURL}
              videoStream={localStream}
              isMuted={!localMicOn}
              isCameraOff={!localCameraOn}
              isLocal isHost={isHostUser}
              role={myRole || 'participant'}
              onPin={() => onPinToggle(mySocketId || 'local')}
              size="small"
            />
          )}
          {others.map((r) => (
            <VideoTile key={r.socketId} {...getTileProps(r.socketId, r)} size="small" />
          ))}
        </Box>
      </Box>
    );
  }

  // Broadcast mode: full-screen broadcaster, local viewer in corner
  if (room?.mode === 'broadcast' && (myRole === 'viewer')) {
    // const broadcaster = remoteTiles.find((r) => r.role === 'broadcaster');
    // In VideoGrid broadcast viewer path:
const broadcaster = remoteTiles.find((r) => r.role === 'broadcaster') 
  || remoteTiles.find((r) => r.videoStream !== null)
  || remoteTiles[0];
    return (
      <Box sx={{ position: 'relative', height: '100%', p: 1.5 }}>
        {broadcaster ? (
          <Box sx={{ height: '100%' }}>
            <VideoTile {...getTileProps(broadcaster.socketId, broadcaster)} size="large" />
          </Box>
        ) : (
          <Box sx={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#475569', flexDirection: 'column', gap: 2,
          }}>
            <Box sx={{ fontSize: 48 }}>📡</Box>
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>Waiting for broadcaster</Box>
              <Box sx={{ fontSize: '0.8rem', color: '#475569', mt: 0.5 }}>The host hasn't started streaming yet</Box>
            </Box>
          </Box>
        )}
        {/* Local viewer in corner */}
        <Box sx={{ position: 'absolute', bottom: 24, right: 24, width: 160 }}>
          <VideoTile
            socketId={mySocketId || 'local'}
            displayName={displayName}
            photoURL={photoURL}
            videoStream={null}
            isCameraOff
            isMuted={!localMicOn}
            isLocal role="viewer"
            size="small"
          />
        </Box>
      </Box>
    );
  }

  // Grid mode
  const allTiles = [
    { isLocal: true as const, socketId: mySocketId || 'local' },
    ...remoteTiles.map((r) => ({ isLocal: false as const, socketId: r.socketId })),
  ];
  const count = allTiles.length;

  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 1.5, p: 1.5, height: '100%',
      alignContent: 'start',
      overflowY: 'auto',
    }}>
      {/* Local tile */}
      <VideoTile
        socketId={mySocketId || 'local'}
        displayName={displayName}
        photoURL={photoURL}
        videoStream={localStream}
        isMuted={!localMicOn}
        isCameraOff={!localCameraOn}
        isLocal isHost={isHostUser}
        isSpeaking={activeSpeakerSocketId === mySocketId}
        isPinned={pinnedSocketId === mySocketId}
        role={myRole || 'participant'}
        onPin={() => onPinToggle(mySocketId || 'local')}
      />
      {/* Remote tiles */}
      {remoteTiles.map((r) => (
        <VideoTile key={r.socketId} {...getTileProps(r.socketId, r)} />
      ))}
    </Box>
  ); 
}