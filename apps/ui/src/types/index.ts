export type RoomMode = 'conference' | 'broadcast';

export interface RoomMeta {
  roomId: string;
  hostId: string;
  hostName: string;
  name: string;
  mode: RoomMode;
  isLocked: boolean;
  password: string | null;
  maxParticipants: number;
  createdAt: number;
  serverId: string;
}

export interface ParticipantMeta {
  socketId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  roomId: string;
  isHost: boolean;
  role: 'host' | 'broadcaster' | 'viewer' | 'participant';
  joinedAt: number;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  timestamp: number;
}

export interface WaitingEntry {
  socketId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  requestedAt: number;
}

export interface ProducerInfo {
  producerId: string;
  socketId: string;
  userId: string;
  displayName: string;
  kind: 'audio' | 'video';
  paused: boolean;
  isScreenShare: boolean;
}

export interface RemoteStream {
  socketId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioLevel: number;
  role: ParticipantMeta['role'];
  isHost: boolean;
}

export interface Reaction {
  id: string;
  socketId: string;
  userId: string;
  displayName: string;
  emoji: string;
  timestamp: number;
}