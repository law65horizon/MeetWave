import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Stack, ToggleButtonGroup, ToggleButton,
  FormControlLabel, Switch, Typography, alpha, CircularProgress,
  InputAdornment, IconButton,
} from '@mui/material';
import { Groups, CastForEducation, Lock, Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { RoomMode } from '../../types';
import { apiFetch } from '../../lib/api';

interface Props { open: boolean; onClose: () => void; }

export default function CreateDemoDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<RoomMode>('conference');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [maxP, setMaxP] = useState(50);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('')

  async function handleCreate() {
    setLoading(true);
    try {
      if (!displayName) return toast.error('Enter a user name');
      const result = await apiFetch<{roomId: string, userId: string}>(`/demo/create`, {
        method: 'POST',
        body: {
          name: name.trim(),
          mode,
          isLocked: locked,
          password: locked && password ? password : undefined,
          maxParticipants: maxP,
          displayName
        }, 
      })

      // if (!response.ok)  throw new Error(`HTTP error! status: ${response.status}`);

      sessionStorage.setItem('demoUser', result.userId)
      // const result = await response.json()
      navigate(`/meeting/${result.roomId}`);
      onClose();

    } catch (error) {
        console.log(error)
      toast.error('Failed to connect to server');
    } finally {
        console.log('iosiso')
        setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, pb: 1 }}>
        Demo meeting
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Room name" fullWidth size="small"
            placeholder="My awesome meeting"
            value={name} onChange={(e) => setName(e.target.value)}
          />

          <TextField
            label="Display name" fullWidth size="small"
            placeholder="James"
            required
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          />

          <Stack spacing={1}>
            <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Mode
            </Typography>
            <ToggleButtonGroup value={mode} exclusive onChange={(_, v) => v && setMode(v)} fullWidth size="small">
              <ToggleButton value="conference" sx={{
                flex: 1, gap: 1, py: 1.2,
                '&.Mui-selected': { background: alpha('#6366F1', 0.15), color: '#818CF8', borderColor: alpha('#6366F1', 0.4) },
              }}>
                <Groups fontSize="small" />
                <Stack alignItems="flex-start">
                  <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Conference</Typography>
                  <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.7rem' }}>Everyone speaks</Typography>
                </Stack>
              </ToggleButton>
              <ToggleButton value="broadcast" sx={{
                flex: 1, gap: 1, py: 1.2,
                '&.Mui-selected': { background: alpha('#10B981', 0.15), color: '#34D399', borderColor: alpha('#10B981', 0.4) },
              }}>
                <CastForEducation fontSize="small" />
                <Stack alignItems="flex-start">
                  <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Broadcast</Typography>
                  <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.7rem' }}>1 presenter</Typography>
                </Stack>
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <FormControlLabel
            control={<Switch checked={locked} onChange={(e) => setLocked(e.target.checked)} size="small" />}
            label={
              <Stack direction="row" alignItems="center" gap={1}>
                <Lock fontSize="small" sx={{ color: locked ? '#F59E0B' : '#475569' }} />
                <Typography variant="body2">Enable waiting room</Typography>
              </Stack>
            }
          />

          {locked && (
            <TextField
              label="Room password (optional)" fullWidth size="small"
              type={showPw ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
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
          )}

          <TextField
            label="Max participants" fullWidth size="small" type="number"
            value={maxP} onChange={(e) => setMaxP(Math.max(2, Math.min(100, Number(e.target.value))))}
            inputProps={{ min: 2, max: 100 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ flex: 1 }}>Cancel</Button>
        <Button
          onClick={handleCreate} variant="contained" disabled={loading} sx={{ flex: 1 }}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : 'Create room'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}