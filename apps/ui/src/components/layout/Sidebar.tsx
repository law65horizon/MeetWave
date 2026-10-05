import { useMemo } from 'react';
import { 
  Box, 
  Drawer, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  Toolbar, 
  Divider, 
  Typography,
  Button
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  VideoIcon,
  CalendarIcon,
  Settings,
  UserCircle,
  HelpCircle,
  LogOut
} from 'lucide-react';
import useAuthStore from '../../store/authStore';

interface SidebarProps {
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
  isLgUp: boolean;
}

// Sidebar width
const drawerWidth = 240;

const Sidebar = ({ mobileOpen, handleDrawerToggle, isLgUp }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const menuItems = useMemo(() => [
    { text: 'Home', icon: <Home size={20} />, path: '/' },
    { text: 'Meetings', icon: <CalendarIcon size={20} />, path: '/meetings' },
    { text: 'Start a Meeting', icon: <VideoIcon size={20} />, path: '/start-meeting' },
    { text: 'Settings', icon: <Settings size={20} />, path: '/settings' },
    { text: 'Profile', icon: <UserCircle size={20} />, path: '/profile' },
    { text: 'Support', icon: <HelpCircle size={20} />, path: '/support' },
  ], []);
  
  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const drawer = (
    <div>
      <Toolbar sx={{ justifyContent: 'center', py: 2 }}>
        <Typography 
          variant="h5" 
          component="div" 
          sx={{ 
            fontWeight: 'bold', 
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <VideoIcon size={24} style={{ marginRight: 8 }} />
          MeetApp
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton 
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{ 
                py: 1.2, 
                '&.Mui-selected': {
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.main',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  }
                }
              }}
            >
              <ListItemIcon 
                sx={{ 
                  color: location.pathname === item.path 
                    ? 'primary.contrastText' 
                    : 'text.primary',
                  minWidth: '40px'
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ position: 'absolute', bottom: '16px', width: '100%', px: 2 }}>
        <Button 
          fullWidth 
          variant="outlined" 
          color="error" 
          startIcon={<LogOut size={18} />}
          onClick={handleLogout}
          sx={{ justifyContent: 'flex-start', py: 1.2 }}
        >
          Sign Out
        </Button>
      </Box>
    </div>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}
    >
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawer}
      </Drawer>
      
      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', lg: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
        open
      >
        {drawer}
      </Drawer>
    </Box>
  );
};

export default Sidebar;