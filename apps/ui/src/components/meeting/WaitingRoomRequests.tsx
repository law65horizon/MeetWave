import { Box, Typography, Avatar, Button, Stack, alpha, Collapse } from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import { useMeetingStore } from '../../store/meetingStore';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface Props { socket: Socket | null; }

export default function WaitingRoomRequests({ socket }: Props) {
  const { waitingList, removeWaiting } = useMeetingStore();

  function admit(socketId: string, name: string) {
    socket?.emit('waiting:admit', { socketId }, (res: { error?: string }) => {
      if (res.error) toast.error(res.error);
      else { removeWaiting(socketId); toast.success(`${name} admitted`); }
    });
  }

  function deny(socketId: string, name: string) {
    socket?.emit('waiting:deny', { socketId }, (res: { error?: string }) => {
      if (res.error) toast.error(res.error);
      else { removeWaiting(socketId); toast(`${name} denied`); }
    });
  }

  if (waitingList.length === 0) return null;

  return (
    <Box sx={{
      position: 'absolute', top: 16, right: 16, zIndex: 200,
      width: 300, maxHeight: 400,
      background: 'rgba(15,17,23,0.95)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    }}>
      <Box sx={{
        px: 2, py: 1.5,
        background: alpha('#F59E0B', 0.1),
        borderBottom: '1px solid rgba(245,158,11,0.2)',
        display: 'flex', alignItems: 'center', gap: 1,
      }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', animation: 'pulse 1.5s infinite' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#F59E0B' }}>
          Waiting room · {waitingList.length}
        </Typography>
      </Box>

      <Stack sx={{ maxHeight: 320, overflowY: 'auto' }}>
        {waitingList.map((entry) => (
          <Box key={entry.socketId} sx={{
            px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            '&:last-child': { borderBottom: 'none' },
          }}>
            <Avatar
              src={entry.photoURL || undefined}
              sx={{ width: 32, height: 32, fontSize: '0.75rem' }}
            >
              {entry.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
            <Typography sx={{ flex: 1, fontSize: '0.82rem', fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.displayName}
            </Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small" variant="contained"
                onClick={() => admit(entry.socketId, entry.displayName)}
                sx={{
                  minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.72rem',
                  background: alpha('#10B981', 0.2), color: '#10B981',
                  border: '1px solid rgba(16,185,129,0.3)',
                  boxShadow: 'none',
                  '&:hover': { background: alpha('#10B981', 0.35), boxShadow: 'none' },
                }}
              >
                <Check sx={{ fontSize: 14 }} />
              </Button>
              <Button
                size="small" variant="contained"
                onClick={() => deny(entry.socketId, entry.displayName)}
                sx={{
                  minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.72rem',
                  background: alpha('#EF4444', 0.15), color: '#EF4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                  boxShadow: 'none',
                  '&:hover': { background: alpha('#EF4444', 0.25), boxShadow: 'none' },
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}