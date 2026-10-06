import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Avatar,
  IconButton,
  Tooltip,
  alpha,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  useTheme,
} from "@mui/material";
import {
  VideoCall,
  Login,
  Logout,
  Person,
  Lock,
  BroadcastOnHome,
  Groups,
  DarkMode,
  LightMode,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useThemeMode } from "../../main";
import CreateMeetingDialog from "../../components/dialogs/CreateMeetingDialog";
import JoinMeetingDialog from "../../components/dialogs/JoinMeetingDialog";

export default function HomePage() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const theme = useTheme();
  const { mode, toggleMode } = useThemeMode();
  const { user } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isDark = mode === "dark";

  async function handleSignOut() {
    await logout();
    navigate("/auth");
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ── Semantic aliases for convenience ──────────────────────────────────────
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const warning = theme.palette.warning.main;
  const textPrimary = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const bgDefault = theme.palette.background.default;
  const bgPaper = theme.palette.background.paper;
  const divider = theme.palette.divider;

  const featureCards = [
    {
      icon: <Groups sx={{ fontSize: 28, color: primary }} />,
      title: "Conference mode",
      desc: "Everyone can speak and share video. Perfect for team meetings up to 50 people.",
      accent: primary,
    },
    {
      icon: <BroadcastOnHome sx={{ fontSize: 28, color: secondary }} />,
      title: "Broadcast mode",
      desc: "One presenter, unlimited viewers. Ideal for webinars, demos, and talks.",
      accent: secondary,
    },
    {
      icon: <Lock sx={{ fontSize: 28, color: warning }} />,
      title: "Waiting room",
      desc: "Lock your room and admit only approved participants with one click.",
      accent: warning,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: bgDefault,
        // The subtle radial gradients are handled by MuiCssBaseline in the theme,
        // but we can reinforce them here so they sit on top of bgDefault:
        backgroundImage: isDark
          ? `
            radial-gradient(ellipse 80% 60% at 15% -5%, ${alpha(primary, 0.15)} 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 85% 105%, ${alpha(secondary, 0.08)} 0%, transparent 55%)
          `
          : `
            radial-gradient(ellipse 70% 50% at 10% -10%, ${alpha(primary, 0.07)} 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 90% 110%, ${alpha(secondary, 0.05)} 0%, transparent 55%)
          `,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: `1px solid ${divider}`,
          background: isDark ? "rgba(8,10,14,0.85)" : "rgba(248,249,252,0.88)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Box
          sx={{
            maxWidth: 1100,
            mx: "auto",
            px: 3,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                background: `linear-gradient(135deg, ${primary} 0%, #8B5CF6 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                boxShadow: `0 4px 12px ${alpha(primary, 0.35)}`,
              }}
            >
              〜
            </Box>
            <Typography
              sx={{
                fontFamily: '"Sora", sans-serif',
                fontWeight: 700,
                fontSize: "1.1rem",
                color: textPrimary,
              }}
            >
              MeetWave
            </Typography>
          </Stack>

          {/* Right actions */}
          <Stack direction="row" alignItems="center" spacing={1}>
            {/* Theme toggle */}
            <Tooltip
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <IconButton
                onClick={toggleMode}
                size="small"
                sx={{
                  color: textSecondary,
                  border: `1px solid ${divider}`,
                  borderRadius: "8px",
                  p: 0.75,
                  "&:hover": {
                    color: textPrimary,
                    borderColor: alpha(primary, 0.4),
                  },
                }}
              >
                {isDark ? (
                  <LightMode fontSize="small" />
                ) : (
                  <DarkMode fontSize="small" />
                )}
              </IconButton>
            </Tooltip>

            {/* Avatar */}
            <Tooltip title={displayName}>
              <Avatar
                src={undefined}
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  border: `2px solid ${alpha(primary, 0.4)}`,
                }}
              >
                {initials}
              </Avatar>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {/* ── User menu ───────────────────────────────────────────────────────── */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { mt: 1, minWidth: 180 } }}
      >
        <MenuItem disabled sx={{ opacity: 1 }}>
          <ListItemIcon>
            <Person fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
            {displayName}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={handleSignOut}
          sx={{ color: theme.palette.error.main }}
        >
          <ListItemIcon>
            <Logout fontSize="small" sx={{ color: theme.palette.error.main }} />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <Box sx={{ maxWidth: 1100, mx: "auto", px: 3, pt: 10, pb: 6 }}>
        <Box sx={{ maxWidth: 680, mx: "auto", textAlign: "center", mb: 8 }}>
          {/* Badge */}
          <Chip
            label="WebRTC · End-to-end encrypted"
            size="small"
            sx={{
              mb: 3,
              background: alpha(primary, isDark ? 0.12 : 0.08),
              border: `1px solid ${alpha(primary, isDark ? 0.3 : 0.25)}`,
              color: isDark
                ? theme.palette.primary.light
                : theme.palette.primary.dark,
              fontWeight: 600,
              fontSize: "0.75rem",
            }}
          />

          {/* Headline */}
          <Typography
            variant="h2"
            sx={{
              fontFamily: '"Sora", sans-serif',
              fontWeight: 800,
              fontSize: { xs: "2rem", sm: "2.8rem", md: "3.4rem" },
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              mb: 2.5,
              // Gradient text — adapts to mode
              background: isDark
                ? "linear-gradient(135deg, #F1F5F9 30%, #818CF8 100%)"
                : `linear-gradient(135deg, #0F172A 30%, ${primary} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Meet without friction
          </Typography>

          <Typography
            variant="h6"
            sx={{
              color: textSecondary,
              fontWeight: 400,
              lineHeight: 1.6,
              mb: 5,
              fontSize: "1.05rem",
            }}
          >
            HD video, real-time collaboration, and broadcast mode — all in one
            place.
          </Typography>

          {/* CTA buttons */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
          >
            <Button
              variant="contained"
              size="large"
              startIcon={<VideoCall />}
              onClick={() => setCreateOpen(true)}
              sx={{ px: 4, py: 1.6, fontSize: "1rem" }}
            >
              New meeting
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<Login />}
              onClick={() => setJoinOpen(true)}
              sx={{ px: 4, py: 1.6, fontSize: "1rem" }}
            >
              Join meeting
            </Button>
          </Stack>
        </Box>

        {/* ── Feature cards ─────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "1fr 1fr 1fr",
            },
            gap: 2,
          }}
        >
          {featureCards.map((card) => (
            <Box
              key={card.title}
              sx={{
                p: 3,
                borderRadius: "16px",
                background: isDark ? "rgba(15,17,23,0.7)" : bgPaper,
                backdropFilter: isDark ? "blur(20px)" : undefined,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : alpha(card.accent, 0.12)}`,
                boxShadow: isDark
                  ? "none"
                  : `0 2px 16px ${alpha(card.accent, 0.06)}`,
                transition: "all 0.25s",
                "&:hover": {
                  border: `1px solid ${alpha(card.accent, 0.35)}`,
                  transform: "translateY(-3px)",
                  boxShadow: `0 12px 40px ${alpha(card.accent, isDark ? 0.12 : 0.1)}`,
                },
              }}
            >
              {/* Icon box */}
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: "12px",
                  mb: 2,
                  background: alpha(card.accent, isDark ? 0.12 : 0.08),
                  border: `1px solid ${alpha(card.accent, isDark ? 0.2 : 0.15)}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {card.icon}
              </Box>

              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                  fontSize: "0.95rem",
                  color: textPrimary,
                }}
              >
                {card.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: textSecondary, lineHeight: 1.6 }}
              >
                {card.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <CreateMeetingDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <JoinMeetingDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </Box>
  );
}
