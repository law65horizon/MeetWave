import { useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Divider,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { useNewMeetingStore } from '../../store/newMeetingStore'; 
import { MediaDevice } from '../../types';

const DeviceSettings = () => {
  const {
    devices,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    setAudioInput,
    setAudioOutput,
    setVideoInput,
    fetchDevices,
    isAudioMuted,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
  } = useNewMeetingStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const audioInputDevices = devices.filter(
    (device) => device.kind === 'audioinput'
  );
  const audioOutputDevices = devices.filter(
    (device) => device.kind === 'audiooutput'
  );
  const videoInputDevices = devices.filter(
    (device) => device.kind === 'videoinput'
  );

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="h6" gutterBottom>
        Audio Settings
      </Typography>
      
      <FormControl fullWidth margin="normal">
        <InputLabel id="audio-input-label">Microphone</InputLabel>
        <Select
          labelId="audio-input-label"
          id="audio-input-select"
          value={selectedAudioInput}
          label="Microphone"
          onChange={(e) => setAudioInput(e.target.value)}
        >
          {audioInputDevices.map((device) => (
            <MenuItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <FormControl fullWidth margin="normal">
        <InputLabel id="audio-output-label">Speaker</InputLabel>
        <Select
          labelId="audio-output-label"
          id="audio-output-select"
          value={selectedAudioOutput}
          label="Speaker"
          onChange={(e) => setAudioOutput(e.target.value)}
        >
          {audioOutputDevices.map((device) => (
            <MenuItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <FormControlLabel
        control={
          <Switch
            checked={!isAudioMuted}
            onChange={toggleAudio}
            color="primary"
          />
        }
        label="Microphone Active"
      />
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="h6" gutterBottom>
        Video Settings
      </Typography>
      
      <FormControl fullWidth margin="normal">
        <InputLabel id="video-input-label">Camera</InputLabel>
        <Select
          labelId="video-input-label"
          id="video-input-select"
          value={selectedVideoInput}
          label="Camera"
          onChange={(e) => setVideoInput(e.target.value)}
        >
          {videoInputDevices.map((device) => (
            <MenuItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <FormControlLabel
        control={
          <Switch
            checked={isVideoEnabled}
            onChange={toggleVideo}
            color="primary"
          />
        }
        label="Camera Active"
      />
      
      <Divider sx={{ my: 2 }} />
      
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Note: In a real application, changing these settings would update your
          actual audio and video streams through WebRTC.
        </Typography>
      </Box>
    </Box>
  );
};

export default DeviceSettings;