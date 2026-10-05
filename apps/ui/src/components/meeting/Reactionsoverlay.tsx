import { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useMeetingStore } from '../../store/meetingStore';
import { v4 as uuid } from 'uuid';
import type { Socket } from 'socket.io-client';
import type { Reaction } from '../../types';

interface Props { socket: Socket | null; }

export default function ReactionsOverlay({ socket }: Props) {
  const { reactions, addReaction, removeReaction } = useMeetingStore();

  useEffect(() => {
    if (!socket) return;
    socket.on('reaction:received', (data: Omit<Reaction, 'id'>) => {
      const r: Reaction = { ...data, id: uuid() };
      addReaction(r);
      setTimeout(() => removeReaction(r.id), 3500);
    });
    return () => { socket.off('reaction:received'); };
  }, [socket, addReaction, removeReaction]);

  return (
    <Box sx={{ position: 'absolute', bottom: 80, left: 20, zIndex: 300, pointerEvents: 'none' }}>
      {reactions.map((r) => (
        <Box
          key={r.id}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, mb: 0.5,
            animation: 'floatUp 3.5s ease-out forwards',
          }}
        >
          <Typography sx={{ fontSize: '1.8rem', lineHeight: 1 }}>{r.emoji}</Typography>
          <Typography sx={{
            fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)',
            background: 'rgba(0,0,0,0.5)', borderRadius: '6px', px: 1, py: 0.3,
          }}>
            {r.displayName}
          </Typography>
        </Box>
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-120px); opacity: 0; }
        }
      `}</style>
    </Box>
  );
}