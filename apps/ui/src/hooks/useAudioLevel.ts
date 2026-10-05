import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../lib/socket';

/**
 * Analyses the local audio stream via Web Audio API and emits
 * level updates to the server (which broadcasts to the room).
 * Returns a ref to the current level (0–100).
 */
export function useAudioLevel(stream: MediaStream | null, isMuted: boolean): React.MutableRefObject<number> {
  const levelRef = useRef(0);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const socket = getSocket();

  const startAnalysis = useCallback((audioStream: MediaStream) => {
    contextRef.current = new AudioContext();
    analyserRef.current = contextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    analyserRef.current.smoothingTimeConstant = 0.8;
    sourceRef.current = contextRef.current.createMediaStreamSource(audioStream);
    sourceRef.current.connect(analyserRef.current);

    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    let lastEmit = 0;

    const tick = () => {
      analyserRef.current!.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length;
      levelRef.current = Math.round((avg / 255) * 100);

      // Emit at most 5 times/second to reduce socket traffic
      const now = Date.now();
      if (now - lastEmit > 200 && !isMuted) {
        socket.emit('audio:level', { level: levelRef.current });
        lastEmit = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [socket, isMuted]);

  useEffect(() => {
    if (!stream || isMuted) {
      levelRef.current = 0;
      return;
    }

    startAnalysis(stream);

    return () => {
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      contextRef.current?.close();
      contextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      levelRef.current = 0;
    };
  }, [stream, isMuted, startAnalysis]);

  return levelRef;
}