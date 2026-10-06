import { useState, useEffect, useCallback } from "react";

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface UseDevicesReturn {
  cameras: MediaDevice[];
  microphones: MediaDevice[];
  speakers: MediaDevice[];
  selectedCamera: string;
  selectedMic: string;
  selectedSpeaker: string;
  setSelectedCamera: (id: string) => void;
  setSelectedMic: (id: string) => void;
  setSelectedSpeaker: (id: string) => void;
  getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
  switchCamera: (
    deviceId: string,
    currentStream: MediaStream | null,
  ) => Promise<MediaStream>;
  switchMic: (
    deviceId: string,
    currentStream: MediaStream | null,
  ) => Promise<MediaStream>;
  refresh: () => Promise<void>;
}

export function useDevices(): UseDevicesReturn {
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [microphones, setMicrophones] = useState<MediaDevice[]>([]);
  const [speakers, setSpeakers] = useState<MediaDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("default");

  const refresh = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const mics = devices.filter((d) => d.kind === "audioinput");
    const spks = devices.filter((d) => d.kind === "audiooutput");

    setCameras(
      cams.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${cams.indexOf(d) + 1}`,
        kind: d.kind,
      })),
    );
    setMicrophones(
      mics.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Mic ${mics.indexOf(d) + 1}`,
        kind: d.kind,
      })),
    );
    setSpeakers(
      spks.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Speaker ${spks.indexOf(d) + 1}`,
        kind: d.kind,
      })),
    );

    if (!selectedCamera && cams.length) setSelectedCamera(cams[0].deviceId);
    if (!selectedMic && mics.length) setSelectedMic(mics[0].deviceId);
  }, [selectedCamera, selectedMic]);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  const getUserMedia = useCallback(
    async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia(
        constraints ?? {
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
          video: selectedCamera
            ? { deviceId: { exact: selectedCamera }, width: 1280, height: 720 }
            : true,
        },
      );
    },
    [selectedCamera, selectedMic],
  );

  const switchCamera = useCallback(
    async (
      deviceId: string,
      currentStream: MediaStream | null,
    ): Promise<MediaStream> => {
      setSelectedCamera(deviceId);
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
        audio: false,
      });

      if (currentStream) {
        const oldTracks = currentStream.getVideoTracks();
        oldTracks.forEach((t) => {
          currentStream.removeTrack(t);
          t.stop();
        });
        newStream.getVideoTracks().forEach((t) => currentStream.addTrack(t));
        return currentStream;
      }
      return newStream;
    },
    [],
  );

  const switchMic = useCallback(
    async (
      deviceId: string,
      currentStream: MediaStream | null,
    ): Promise<MediaStream> => {
      setSelectedMic(deviceId);
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });

      if (currentStream) {
        const oldTracks = currentStream.getAudioTracks();
        oldTracks.forEach((t) => {
          currentStream.removeTrack(t);
          t.stop();
        });
        newStream.getAudioTracks().forEach((t) => currentStream.addTrack(t));
        return currentStream;
      }
      return newStream;
    },
    [],
  );

  return {
    cameras,
    microphones,
    speakers,
    selectedCamera,
    selectedMic,
    selectedSpeaker,
    setSelectedCamera,
    setSelectedMic,
    setSelectedSpeaker,
    getUserMedia,
    switchCamera,
    switchMic,
    refresh,
  };
}
