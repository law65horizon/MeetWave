import React, { createContext, useContext, useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Toaster } from 'react-hot-toast';
import { darkTheme, lightTheme } from './theme/index';
import App from './App';

// ─── Theme mode context ───────────────────────────────────────────────────────
interface ThemeModeContextValue {
  mode: 'light' | 'dark';
  toggleMode: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'dark',
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function Root() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');

  const themeModeValue = useMemo<ThemeModeContextValue>(
    () => ({ mode, toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }),
    [mode],
  );

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  // Toaster adapts to mode
  const toasterStyle =
    mode === 'dark'
      ? {
          background: 'rgba(15,17,23,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#F1F5F9',
        }
      : {
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(15,23,42,0.1)',
          color: '#0F172A',
          boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
        };

  return (
    <ThemeModeContext.Provider value={themeModeValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              ...toasterStyle,
              fontFamily: '"Sora", "DM Sans", sans-serif',
              fontWeight: 500,
              fontSize: '0.875rem',
              borderRadius: '12px',
              padding: '12px 16px',
              boxShadow: mode === 'dark'
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(15,23,42,0.12)',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
          }}
        />
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import { ThemeProvider } from '@mui/material/styles';
// import CssBaseline from '@mui/material/CssBaseline';
// import { Toaster } from 'react-hot-toast';
// import  theme from './theme/index';
// import App from './App';

// ReactDOM.createRoot(document.getElementById('root')!).render(
//   <React.StrictMode>
//     <ThemeProvider theme={theme}>
//       <CssBaseline />
//       <App />
//       <Toaster
//         position="top-center"
//         toastOptions={{
//           style: {
//             background: 'rgba(15,17,23,0.95)',
//             backdropFilter: 'blur(20px)',
//             border: '1px solid rgba(255,255,255,0.1)',
//             color: '#F1F5F9',
//             fontFamily: '"DM Sans", sans-serif',
//             fontWeight: 500,
//             fontSize: '0.875rem',
//             borderRadius: '12px',
//             padding: '12px 16px',
//             boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
//           },
//           success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
//           error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
//         }}
//       />
//     </ThemeProvider>
//   </React.StrictMode>
// );