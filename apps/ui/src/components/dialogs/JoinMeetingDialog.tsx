import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Stack, Typography, CircularProgress,
  InputAdornment, IconButton,
} from '@mui/material';
import { Login, Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth } from '../../lib/firebase';

interface Props { open: boolean; onClose: () => void; }

export default function JoinMeetingDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    const id = roomId.trim().toLowerCase();
    if (!id) return toast.error('Enter a room code');
    if (!displayName.trim() && !auth.currentUser) return toast.error('Enter display name');
    setLoading(true);
    try {
      // const token = await auth.currentUser?.getIdToken();
      // if (!token) return toast.error('Not authenticated');
      // const socket = connectSocket(token);
      // await new Promise<void>((res, rej) => {
      //   socket.once('connect', res);
      //   socket.once('connect_error', rej);
      //   setTimeout(() => rej(new Error('timeout')), 8000);
      // });
      // // Quick check room exists
      // socket.emit('room:join', { roomId: id, password: password || undefined }, (res: { error?: string; waiting?: boolean }) => {
      //   setLoading(false);
      //   if (res.error === 'ROOM_NOT_FOUND') return toast.error('Room not found');
      //   if (res.error === 'WRONG_PASSWORD') return toast.error('Wrong password');
      //   if (res.error === 'ROOM_FULL') return toast.error('Room is full');
      //   if (res.error) return toast.error(res.error);
      //   navigate(`/meeting/${id}${password ? `?pw=${encodeURIComponent(password)}` : ''}`);
      //   onClose();
      // });
      if (displayName) localStorage.setItem('displayName', displayName)
      console.log('navigating')
      navigate(`/meeting/${id}${password ? `?pw=${encodeURIComponent(password)}` : ''}`);
      onClose()
    } catch {
      setLoading(false);
      toast.error('Failed to connect');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, pb: 1 }}>
        Join a meeting
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Room code" fullWidth size="small"
            placeholder="e.g. oak-river-42"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.05em' } }}
          />
          <TextField
            label="Password (if required)" fullWidth size="small"
            type={showPw ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {!auth.currentUser && <TextField
            label="Dispaly name" fullWidth size="small"
            type='text'
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.05em' } }}
          />}
          <Typography variant="caption" sx={{ color: '#475569' }}>
            Room codes look like <span style={{ fontFamily: 'monospace', color: '#818CF8' }}>word-word-nn</span>
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ flex: 1 }}>Cancel</Button>
        <Button onClick={handleJoin} variant="contained" disabled={loading} startIcon={loading ? undefined : <Login />} sx={{ flex: 1 }}>
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Join'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}