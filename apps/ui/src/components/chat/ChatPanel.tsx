import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, TextField, IconButton, Avatar,
  Stack, alpha, InputAdornment, useTheme,
} from '@mui/material';
import { Send, Close } from '@mui/icons-material';
import { formatDistanceToNowStrict } from 'date-fns';
import { useMeetingStore } from '../../store/meetingStore';
import { useAuthStore } from '../../store/authStore';
import type { Socket } from 'socket.io-client';

interface Props { socket: Socket | null; }

export default function ChatPanel({ socket }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary   = theme.palette.primary.main;
  const textPrimary   = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const divider   = theme.palette.divider;
  const bgPaper   = theme.palette.background.paper;

  const { messages, typingUsers, setChatOpen, resetUnread } = useMeetingStore();
  const { user } = useAuthStore();
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    resetUnread();
  }, [resetUnread]);

  function handleTyping(val: string) {
    setText(val);
    if (!isTyping && socket) {
      setIsTyping(true);
      socket.emit('chat:typing', { isTyping: true });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit('chat:typing', { isTyping: false });
    }, 1500);
  }

  function handleSend() {
    const msg = text.trim();
    if (!msg || !socket) return;
    socket.emit('chat:send', { text: msg }, () => {});
    setText('');
    setIsTyping(false);
    socket.emit('chat:typing', { isTyping: false });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }

  const typingNames = Array.from(typingUsers.values()).join(', ');

  // Own message bubble color adapts to theme
  const ownBubbleBg    = isDark ? alpha(primary, 0.2)  : alpha(primary, 0.12);
  const ownBubbleBorder = isDark ? alpha(primary, 0.3) : alpha(primary, 0.22);
  const otherBubbleBg   = isDark ? 'rgba(255,255,255,0.06)' : alpha(theme.palette.text.primary, 0.05);
  const otherBubbleBorder = isDark ? 'rgba(255,255,255,0.08)' : alpha(theme.palette.text.primary, 0.08);

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
          Meeting chat
        </Typography>
        <IconButton size="small" onClick={() => setChatOpen(false)} sx={{ color: textSecondary }}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* Messages */}
      <Box sx={{
        flex: 1, overflowY: 'auto',
        px: 2, py: 1.5,
        display: 'flex', flexDirection: 'column', gap: 2,
        // Custom scrollbar
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: isDark ? 'rgba(255,255,255,0.1)' : alpha(theme.palette.text.primary, 0.12),
          borderRadius: 4,
        },
      }}>
        {messages.length === 0 && (
          <Box sx={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 1,
          }}>
            <Typography sx={{ fontSize: 32 }}>💬</Typography>
            <Typography variant="body2" sx={{ color: textSecondary, textAlign: 'center' }}>
              No messages yet. Say hello!
            </Typography>
          </Box>
        )}

        {messages.map((msg) => {
          const isOwn = msg.senderId === user?.uid;
          return (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                gap: 1,
                alignItems: 'flex-end',
              }}
            >
              {!isOwn && (
                <Avatar
                  src={msg.senderPhoto || undefined}
                  sx={{ width: 28, height: 28, fontSize: '0.7rem', flexShrink: 0 }}
                >
                  {msg.senderName.slice(0, 2).toUpperCase()}
                </Avatar>
              )}
              <Box sx={{ maxWidth: '78%' }}>
                {!isOwn && (
                  <Typography sx={{
                    fontSize: '0.7rem', color: textSecondary,
                    mb: 0.4, fontWeight: 500, px: 0.5,
                  }}>
                    {msg.senderName}
                  </Typography>
                )}
                <Box sx={{
                  px: 1.5, py: 1,
                  background: isOwn ? ownBubbleBg : otherBubbleBg,
                  border: `1px solid ${isOwn ? ownBubbleBorder : otherBubbleBorder}`,
                  borderRadius: isOwn ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                }}>
                  <Typography sx={{
                    fontSize: '0.875rem',
                    color: textPrimary,
                    lineHeight: 1.5, wordBreak: 'break-word',
                  }}>
                    {msg.text}
                  </Typography>
                </Box>
                <Typography sx={{
                  fontSize: '0.65rem',
                  color: isDark ? '#334155' : alpha(theme.palette.text.secondary, 0.7),
                  mt: 0.4, px: 0.5,
                  textAlign: isOwn ? 'right' : 'left',
                }}>
                  {formatDistanceToNowStrict(msg.timestamp, { addSuffix: true })}
                </Typography>
              </Box>
            </Box>
          );
        })}
        <div ref={bottomRef} />
      </Box>

      {/* Typing indicator */}
      <Box sx={{ px: 2.5, height: 22, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {typingNames && (
          <Typography sx={{
            fontSize: '0.72rem',
            color: textSecondary,
            fontStyle: 'italic',
          }}>
            {typingNames} {typingUsers.size === 1 ? 'is' : 'are'} typing…
          </Typography>
        )}
      </Box>

      {/* Input */}
      <Box sx={{ px: 2, pb: 2, flexShrink: 0 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Send a message…"
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          multiline
          maxRows={4}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleSend}
                  disabled={!text.trim()}
                  sx={{
                    color: text.trim()
                      ? primary
                      : isDark ? '#334155' : alpha(textSecondary, 0.5),
                    transition: 'color 0.15s',
                  }}
                >
                  <Send fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
            sx: {
              borderRadius: '12px',
              fontSize: '0.875rem',
              background: isDark ? 'rgba(255,255,255,0.04)' : alpha(theme.palette.text.primary, 0.03),
              '& fieldset': {
                borderColor: divider,
              },
              '&:hover fieldset': {
                borderColor: `${alpha(primary, 0.4)} !important`,
              },
              '&.Mui-focused fieldset': {
                borderColor: `${primary} !important`,
              },
            },
          }}
        />
      </Box>
    </Box>
  );
}