import { useState } from 'react';
import {
  Box, Typography, TextField, Button, Divider, IconButton,
  InputAdornment, CircularProgress, Stack,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login, register } from '../../lib/authApi';
import { errorMessage } from '../../lib/api';
import JoinMeetingDialog from '../../components/dialogs/JoinMeetingDialog';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [joinOpen,   setJoinOpen]   = useState(false);

  async function handleEmail() {
    if (!email || !password) return toast.error('Fill in all fields');
    if (mode === 'signup') {
      if (!name.trim()) return toast.error('Enter your name');
      if (password.length < 8) return toast.error('Password must be at least 8 characters');
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await register({ name: name.trim(), email, password });
      } else {
        await login({ email, password });
      }
      navigate('/');
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#080A0E',
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 15% -5%, rgba(99,102,241,0.18) 0%, transparent 55%),
          radial-gradient(ellipse 50% 40% at 85% 105%, rgba(16,185,129,0.1) 0%, transparent 55%)
        `,
        backgroundAttachment: 'fixed',
        p: 2,
      }}
    >
      {/* Decorative grid */}
      <Box sx={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <Box sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <Stack alignItems="center" mb={4}>
          <Box sx={{
            width: 52, height: 52, borderRadius: '14px', mb: 2,
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
          }}>
            <Typography sx={{ fontSize: 22, lineHeight: 1 }}>〜</Typography>
          </Box>
          <Typography variant="h4" sx={{ fontFamily: '"Sora", sans-serif', fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.03em' }}>
            MeetWave
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
            Crystal-clear video meetings, instantly
          </Typography>
        </Stack>

        {/* Card */}
        <Box sx={{
          background: 'rgba(15,17,23,0.85)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          p: 3.5,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}>
          {/* Tab switcher */}
          <Box sx={{
            display: 'flex', gap: 0.5, mb: 3,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '10px', p: 0.5,
          }}>
            {(['login', 'signup'] as const).map((m) => (
              <Box
                key={m}
                onClick={() => setMode(m)}
                sx={{
                  flex: 1, textAlign: 'center', py: 1, borderRadius: '8px',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: mode === m ? 'rgba(99,102,241,0.2)' : 'transparent',
                  border: mode === m ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  color: mode === m ? '#818CF8' : '#64748B',
                  fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.875rem',
                  '&:hover': { color: mode === m ? '#818CF8' : '#94A3B8' },
                }}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </Box>
            ))}
          </Box>

          <Stack spacing={2}>
            {mode === 'signup' && (
              <TextField
                fullWidth size="small" label="Display name"
                value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
              />
            )}
            <TextField
              fullWidth size="small" label="Email address" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
            />
            <TextField
              fullWidth size="small" label="Password"
              type={showPw ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPw(!showPw)} sx={{ color: '#64748B' }}>
                      {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              fullWidth variant="contained" size="large"
              onClick={handleEmail} disabled={loading}
              sx={{ mt: 0.5, py: 1.3, fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>

            <Divider sx={{ '&::before, &::after': { borderColor: 'rgba(255,255,255,0.07)' } }}>
              <Typography variant="caption" sx={{ color: '#475569', px: 1 }}>or</Typography>
            </Divider>

            <Button
              fullWidth variant="outlined" size="large"
              onClick={() => setJoinOpen(true)} disabled={loading}
              sx={{ mt: 0.5, py: 1.3, fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Join Meeting'}
            </Button>
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#334155', mt: 3 }}>
          By continuing you agree to our Terms of Service
        </Typography>
      </Box>

      <JoinMeetingDialog   open={joinOpen}   onClose={() => setJoinOpen(false)} />
    </Box>
  );
}