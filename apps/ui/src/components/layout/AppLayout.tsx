import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Box, CssBaseline, useMediaQuery, useTheme } from "@mui/material";
import Sidebar from "./Sidebar";
import Header from "./Header";

const AppLayout = () => {
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Don't show the sidebar and header on the auth page
  if (
    location.pathname === "/auth" ||
    (location.pathname.startsWith("/meeting") &&
      location.pathname !== "/meetings")
  ) {
    return <Outlet />;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <CssBaseline />
      <Header handleDrawerToggle={handleDrawerToggle} />
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        isLgUp={isLgUp}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${240}px)` },
          mt: "64px",
          height: "calc(100vh - 64px)",
          overflow: "auto",
          bgcolor: "background.default",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
