import { createTheme, alpha } from '@mui/material/styles';

// ─── Shared design tokens ────────────────────────────────────────────────────
const PRIMARY   = '#6366F1'; // indigo-500
const PRIMARY_L = '#818CF8'; // indigo-400 (lighter for dark mode text)
const PRIMARY_D = '#4F46E5'; // indigo-600
const SECONDARY = '#10B981'; // emerald-500
const ERROR     = '#EF4444';
const WARNING   = '#F59E0B';
const SUCCESS   = '#10B981';
const INFO      = '#38BDF8';

// ─── Typography shared ────────────────────────────────────────────────────────
const typography = {
  fontFamily: '"Sora", "DM Sans", "Helvetica", sans-serif',
  h1: { fontSize: '3rem',   fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.04em' },
  h2: { fontSize: '2.4rem', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.04em' },
  h3: { fontSize: '1.9rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.03em' },
  h4: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h5: { fontSize: '1.25rem',fontWeight: 600, lineHeight: 1.3 },
  h6: { fontSize: '1rem',   fontWeight: 600, lineHeight: 1.4 },
  subtitle1: { fontSize: '1rem',    fontWeight: 400, lineHeight: 1.6 },
  subtitle2: { fontSize: '0.875rem',fontWeight: 500, lineHeight: 1.6 },
  body1:     { fontSize: '1rem',    fontWeight: 400, lineHeight: 1.6 },
  body2:     { fontSize: '0.875rem',fontWeight: 400, lineHeight: 1.55 },
  button:    { fontSize: '0.875rem',fontWeight: 700, lineHeight: 1.75, textTransform: 'none' as const },
  caption:   { fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.5 },
};

// ─── Shared shape / component overrides ──────────────────────────────────────
const shape = { borderRadius: 10 };

// ─── DARK THEME ──────────────────────────────────────────────────────────────
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:   { main: PRIMARY,   light: PRIMARY_L, dark: PRIMARY_D, contrastText: '#fff' },
    secondary: { main: SECONDARY, light: '#34D399',  dark: '#059669',  contrastText: '#fff' },
    error:     { main: ERROR },
    warning:   { main: WARNING },
    success:   { main: SUCCESS },
    info:      { main: INFO },
    background: {
      default: '#080A0E',   // near-black canvas
      paper:   '#0F1117',   // elevated surface
    },
    text: {
      primary:   '#F1F5F9',  // slate-100
      secondary: '#64748B',  // slate-500
      disabled:  '#334155',  // slate-700
    },
    divider: 'rgba(255,255,255,0.07)',
    action: {
      hover:    'rgba(99,102,241,0.08)',
      selected: 'rgba(99,102,241,0.14)',
      disabled: 'rgba(255,255,255,0.18)',
    },
  },
  typography,
  shape,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: `
            radial-gradient(ellipse 80% 60% at 15% -5%, ${alpha(PRIMARY, 0.15)} 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 85% 105%, ${alpha(SECONDARY, 0.08)} 0%, transparent 55%)
          `,
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          padding: '8px 20px',
          fontWeight: 700,
          transition: 'all 0.2s ease',
        },
        contained: {
          background: `linear-gradient(135deg, ${PRIMARY}, #8B5CF6)`,
          boxShadow: `0 8px 32px ${alpha(PRIMARY, 0.4)}`,
          '&:hover': {
            boxShadow: `0 12px 40px ${alpha(PRIMARY, 0.55)}`,
            transform: 'translateY(-2px)',
          },
        },
        outlined: {
          borderColor: alpha(PRIMARY, 0.4),
          color: PRIMARY_L,
          '&:hover': {
            borderColor: PRIMARY,
            background: alpha(PRIMARY, 0.08),
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: 'rgba(15,17,23,0.7)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: '#13151C',
          border: '1px solid rgba(255,255,255,0.07)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'rgba(8,10,14,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, fontSize: '0.75rem' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: '#1E2130',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.8rem',
          borderRadius: 8,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: '#13151C',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          mx: 1,
          '&:hover': { background: alpha(PRIMARY, 0.1) },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          background: `linear-gradient(135deg, ${PRIMARY}, #8B5CF6)`,
          fontWeight: 700,
        },
      },
    },
  },
});

// ─── LIGHT THEME ─────────────────────────────────────────────────────────────
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: PRIMARY_D, light: PRIMARY, dark: '#3730A3', contrastText: '#fff' },
    secondary: { main: SECONDARY, light: '#34D399', dark: '#059669', contrastText: '#fff' },
    error:     { main: ERROR },
    warning:   { main: WARNING },
    success:   { main: SUCCESS },
    info:      { main: INFO },
    background: {
      default: '#F8F9FC',   // cool off-white
      paper:   '#FFFFFF',
    },
    text: {
      primary:   '#0F172A',  // slate-900
      secondary: '#475569',  // slate-600
      disabled:  '#94A3B8',  // slate-400
    },
    divider: 'rgba(15,23,42,0.08)',
    action: {
      hover:    alpha(PRIMARY_D, 0.06),
      selected: alpha(PRIMARY_D, 0.1),
      disabled: 'rgba(15,23,42,0.25)',
    },
  },
  typography,
  shape,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 10% -10%, ${alpha(PRIMARY, 0.07)} 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 90% 110%, ${alpha(SECONDARY, 0.05)} 0%, transparent 55%)
          `,
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          padding: '8px 20px',
          fontWeight: 700,
          transition: 'all 0.2s ease',
        },
        contained: {
          background: `linear-gradient(135deg, ${PRIMARY_D}, ${PRIMARY})`,
          boxShadow: `0 4px 16px ${alpha(PRIMARY_D, 0.3)}`,
          '&:hover': {
            boxShadow: `0 8px 28px ${alpha(PRIMARY_D, 0.4)}`,
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: alpha(PRIMARY_D, 0.35),
          color: PRIMARY_D,
          '&:hover': {
            borderColor: PRIMARY_D,
            background: alpha(PRIMARY_D, 0.06),
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: '#FFFFFF',
          border: '1px solid rgba(15,23,42,0.07)',
          boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'rgba(248,249,252,0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(15,23,42,0.07)',
          boxShadow: 'none',
          color: '#0F172A',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, fontSize: '0.75rem' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: '#1E293B',
          fontSize: '0.8rem',
          borderRadius: 8,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: '1px solid rgba(15,23,42,0.09)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': { background: alpha(PRIMARY_D, 0.07) },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          background: `linear-gradient(135deg, ${PRIMARY_D}, ${PRIMARY})`,
          fontWeight: 700,
          color: '#fff',
        },
      },
    },
  },
});

// Default export — dark theme (you can swap to lightTheme as your app default)
export default darkTheme;

// import { createTheme } from '@mui/material/styles';

// const theme = createTheme({
//   palette: {
//     primary: {
//       main: '#3f51b5', // Indigo
//       light: '#757de8',
//       dark: '#002984',
//     },
//     secondary: {
//       main: '#009688', // Teal
//       light: '#52c7b8',
//       dark: '#00675b',
//     },
//     error: {
//       main: '#f44336', // Red
//     },
//     warning: {
//       main: '#ff9800', // Orange
//     },
//     success: {
//       main: '#4caf50', // Green
//     },
//     info: {
//       main: '#03a9f4', // Light Blue
//     },
//     background: {
//       default: '#f5f5f5',
//       paper: '#ffffff',
//     },
//   },
//   typography: {
//     fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
//     h1: {
//       fontSize: '2.5rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     h2: {
//       fontSize: '2rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     h3: {
//       fontSize: '1.75rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     h4: {
//       fontSize: '1.5rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     h5: {
//       fontSize: '1.25rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     h6: {
//       fontSize: '1rem',
//       fontWeight: 500,
//       lineHeight: 1.2,
//     },
//     subtitle1: {
//       fontSize: '1rem',
//       fontWeight: 400,
//       lineHeight: 1.5,
//     },
//     subtitle2: {
//       fontSize: '0.875rem',
//       fontWeight: 500,
//       lineHeight: 1.57,
//     },
//     body1: {
//       fontSize: '1rem',
//       fontWeight: 400,
//       lineHeight: 1.5,
//     },
//     body2: {
//       fontSize: '0.875rem',
//       fontWeight: 400,
//       lineHeight: 1.43,
//     },
//     button: {
//       fontSize: '0.875rem',
//       fontWeight: 500,
//       lineHeight: 1.75,
//       textTransform: 'none',
//     },
//   },
//   shape: {
//     borderRadius: 8,
//   },
//   components: {
//     MuiButton: {
//       styleOverrides: {
//         root: {
//           textTransform: 'none',
//           borderRadius: 8,
//           padding: '8px 16px',
//         },
//         contained: {
//           boxShadow: 'none',
//           '&:hover': {
//             boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2)',
//           },
//         },
//       },
//     },
//     MuiCard: {
//       styleOverrides: {
//         root: {
//           borderRadius: 12,
//           boxShadow: '0 4px 6px rgba(0, 0, 0, 0.04)',
//         },
//       },
//     },
//     MuiAppBar: {
//       styleOverrides: {
//         root: {
//           boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
//         },
//       },
//     },
//   },
// });

// export default theme;