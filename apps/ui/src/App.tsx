import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuthStore } from "./store/authStore";
import AuthPage from "./pages/auth/AuthPage";
import HomePage from "./pages/home/HomePage";
import MeetingRoom from "./pages/meeting/MeetingRoom";

function FullScreenSpinner() {
  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress sx={{ color: "#6366F1" }} />
    </Box>
  );
}

// Only for logged-in users. Remembers where they were headed so login can send them back.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  return <>{children}</>;
}

// Only for logged-out users (e.g. /auth). Authenticated users get bounced to where they were going, or home.
function GuestGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (user) {
    const from = (
      location.state as { from?: { pathname: string; search?: string } } | null
    )?.from;
    return (
      <Navigate
        to={from ? `${from.pathname}${from.search ?? ""}` : "/"}
        replace
      />
    );
  }
  return <>{children}</>;
}
export default function App() {
  const initAuth = useAuthStore((s) => s.initAuth);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  if (loading) {
    return (
      <Box sx={{ height: "100dvh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/auth"
          element={
            <GuestGuard>
              <AuthPage />
            </GuestGuard>
          }
        />
        <Route
          path="/"
          element={
            <AuthGuard>
              <HomePage />
            </AuthGuard>
          }
        />
        <Route path="/meeting/:roomId" element={<MeetingRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
