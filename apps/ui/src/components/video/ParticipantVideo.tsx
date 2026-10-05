import { memo, useState, useEffect, useRef } from 'react';
import { Box, Typography, Avatar, IconButton } from '@mui/material';
import { Mic, MicOff, Pin, MoreVertical } from 'lucide-react';
import { Participant } from '../../types';

interface ParticipantVideoProps {
  participant: Participant;
  isLocal?: boolean;
  isFocused?: boolean;
  onClick?: () => void;
  height?: string | number;
  width?: string | number;
  stream?: any
}

interface VideoPlayerProps {
  stream: MediaStream | null;
  peerId: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ stream, peerId }) => {
  console.log('earl',stream)
  const ref = useRef<HTMLVideoElement>(null);

  // Whenever the “stream” prop changes, reassign
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch((err) => console.error("Play error:", err));
      console.log(stream!.getTracks())
    }
  }, [stream]);

  return (
    // <video
    //   id={peerId}
    //   ref={ref}
    //   autoPlay
    //   muted={false}   // or true if you want to mute by default
    //   playsInline
    //   style={{ width: 200, height: 150, margin: 4, transform: 'scaleX(-1)' }} 
    // />
    <Box component={'video'} ref={ref} autoPlay muted={false} playsInline
      sx={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scaleX(-1)'
      }}
    />
  );
};

const ParticipantVideo = ({
  participant,
  isLocal = false,
  isFocused = false,
  onClick,
  height = '100%',
  width = '100%',
  stream,
}: ParticipantVideoProps) => {
  const [videoError, setVideoError] = useState(false);
  
  // In a real app, this would use WebRTC to show the actual video stream
  // Here we're just displaying a placeholder
  
  const { name, avatar, isAudioOn, isVideoOn, isHost } = participant;
  console.log('misses', stream, videoError)

  const videoRef = useRef<HTMLVideoElement>(null);

  // Whenever the “stream” prop changes, reassign
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => console.error("Play error:", err));
      // console.log(stream!.getTracks())
    }
  }, [stream]);
  // Mock video failure for demo purposes
  useEffect(() => {
    setVideoError(!isVideoOn);
  }, [isVideoOn]);

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        width,
        backgroundColor: '#252525',
        borderRadius: 0,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        border: isFocused ? '2px solid #3f51b5' : 'none',
      }}
      onClick={onClick}
    >
      {!videoError ? (
        // Video off state - show avatar
        <Avatar
          src={avatar}
          alt={name}
          sx={{
            width: '30%',
            height: 'auto',
            aspectRatio: '1/1',
            fontSize: '3rem',
          }}
        />
      ) : (<>
        {/* <VideoPlayer key={participant.id} stream={stream} peerId={participant.id} /> */}
        <Box
          component="video"
          ref={videoRef}
          playsInline
          muted={false}
          autoPlay
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)'
          }}
        />
     </>)}

      {/* Bottom info bar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 1,
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isAudioOn ? <MicOff size={16} color="#f44336" /> : <Mic size={16} color="#4caf50" />}
          <Typography variant="body2" sx={{ ml: 1, color: 'white' }}>
            {name} {isLocal && '(You)'} {isHost && '(Host)'}
          </Typography>
        </Box>

        {isFocused && (
          <IconButton size="small" sx={{ color: 'white' }}>
            <Pin size={16} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
};

export default memo(ParticipantVideo);