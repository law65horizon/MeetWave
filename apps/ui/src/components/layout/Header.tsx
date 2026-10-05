import { useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  IconButton, 
  Typography, 
  Menu, 
  MenuItem, 
  Avatar, 
  Box,
  Badge
} from '@mui/material';
import { Menu as MenuIcon, Bell, Link } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  handleDrawerToggle: () => void;
}

const Header = ({ handleDrawerToggle }: HeaderProps) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchorEl(null);
  };

  const handleProfileClick = () => {
    navigate('/profile');
    handleMenuClose();
  };

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'white',
        color: 'text.primary',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)'
      }}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={handleDrawerToggle}
          sx={{ mr: 2, display: { lg: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{ flexGrow: 1 }}
        >
          {/* Empty space for flexbox spacing */}
        </Typography>
        
        {/* Meeting link button */}
        <IconButton 
          color="primary"
          sx={{ mx: 1 }}
          onClick={() => navigate('/start-meeting')}
        >
          <Link size={20} />
        </IconButton>
        
        {/* Notifications */}
        <IconButton 
          color="inherit"
          sx={{ mx: 1 }}
          onClick={handleNotificationOpen}
        >
          <Badge badgeContent={3} color="error">
            <Bell size={20} />
          </Badge>
        </IconButton>
        <Menu
          anchorEl={notificationAnchorEl}
          open={Boolean(notificationAnchorEl)}
          onClose={handleNotificationClose}
          PaperProps={{
            sx: { width: 320, maxHeight: 400, mt: 1.5 }
          }}
        >
          <MenuItem onClick={handleNotificationClose}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2">Weekly Team Sync in 10 minutes</Typography>
              <Typography variant="body2" color="text.secondary">You have an upcoming meeting</Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleNotificationClose}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2">New feature available</Typography>
              <Typography variant="body2" color="text.secondary">Screen sharing annotations are now available</Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleNotificationClose}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle2">You've been added to Design Review</Typography>
              <Typography variant="body2" color="text.secondary">Sarah added you to a meeting tomorrow</Typography>
            </Box>
          </MenuItem>
        </Menu>
        
        {/* User profile */}
        <IconButton 
          onClick={handleMenuOpen}
          sx={{ 
            ml: 1,
            '&:hover': { 
              bgcolor: 'rgba(0, 0, 0, 0.04)'
            } 
          }}
        >
          <Avatar 
            alt={user?.name || 'User'} 
            src={user?.avatar} 
            sx={{ width: 32, height: 32 }}
          />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleProfileClick}>Profile</MenuItem>
          <MenuItem onClick={handleMenuClose}>Settings</MenuItem>
          <MenuItem onClick={() => {
            handleMenuClose();
            navigate('/auth');
          }}>Logout</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;