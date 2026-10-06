import { create } from "zustand";
import type {
  RoomMeta,
  ParticipantMeta,
  ChatMessage,
  WaitingEntry,
  RemoteStream,
  Reaction,
} from "../types";

interface MeetingState {
  // Room
  room: RoomMeta | null;
  participants: ParticipantMeta[];
  myRole: ParticipantMeta["role"] | null;
  mySocketId: string | null;

  // Media
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteStreams: Map<string, RemoteStream>;
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;

  // Chat
  messages: ChatMessage[];
  typingUsers: Map<string, string>; // socketId -> displayName
  unreadCount: number;

  // Reactions
  reactions: Reaction[];

  // Waiting room
  waitingList: WaitingEntry[];

  // Time sync
  clockOffset: number; // add to Date.now() to get server time

  // UI
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  layoutMode: "grid" | "spotlight" | "sidebar";
  pinnedSocketId: string | null;
  activeSpeakerSocketId: string | null;

  // Actions
  setRoom: (room: RoomMeta | null) => void;
  setParticipants: (p: ParticipantMeta[]) => void;
  addParticipant: (p: ParticipantMeta) => void;
  removeParticipant: (socketId: string) => void;
  setMyRole: (role: ParticipantMeta["role"] | null) => void;
  setMySocketId: (id: string | null) => void;
  setLocalStream: (s: MediaStream | null) => void;
  setLocalScreenStream: (s: MediaStream | null) => void;
  setRemoteStream: (socketId: string, data: Partial<RemoteStream>) => void;
  removeRemoteStream: (socketId: string) => void;
  setMicOn: (v: boolean) => void;
  setCameraOn: (v: boolean) => void;
  setScreenSharing: (v: boolean) => void;
  addMessage: (m: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setTyping: (socketId: string, name: string, isTyping: boolean) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
  addReaction: (r: Reaction) => void;
  removeReaction: (id: string) => void;
  setWaitingList: (list: WaitingEntry[]) => void;
  addWaiting: (e: WaitingEntry) => void;
  removeWaiting: (socketId: string) => void;
  setClockOffset: (offset: number) => void;
  setChatOpen: (v: boolean) => void;
  setParticipantsOpen: (v: boolean) => void;
  setLayoutMode: (m: "grid" | "spotlight" | "sidebar") => void;
  setPinnedSocketId: (id: string | null) => void;
  setActiveSpeaker: (socketId: string | null) => void;
  reset: () => void;
}

const initialState = {
  room: null,
  participants: [],
  myRole: null,
  mySocketId: null,
  localStream: null,
  localScreenStream: null,
  remoteStreams: new Map(),
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
  messages: [],
  typingUsers: new Map(),
  unreadCount: 0,
  reactions: [],
  waitingList: [],
  clockOffset: 0,
  isChatOpen: false,
  isParticipantsOpen: false,
  layoutMode: "grid" as const,
  pinnedSocketId: null,
  activeSpeakerSocketId: null,
};

export const useMeetingStore = create<MeetingState>((set, get) => ({
  ...initialState,
  setRoom: (room) => set({ room }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (p) =>
    set((s) => ({
      participants: [
        ...s.participants.filter((x) => x.socketId !== p.socketId),
        p,
      ],
    })),
  removeParticipant: (socketId) =>
    set((s) => ({
      participants: s.participants.filter((x) => x.socketId !== socketId),
    })),
  setMyRole: (myRole) => set({ myRole }),
  setMySocketId: (mySocketId) => set({ mySocketId }),
  setLocalStream: (localStream) => set({ localStream }),
  setLocalScreenStream: (localScreenStream) => set({ localScreenStream }),
  setRemoteStream: (socketId, data) =>
    set((s) => {
      const map = new Map(s.remoteStreams);
      const existing = map.get(socketId) || {
        socketId,
        userId: "",
        displayName: "",
        photoURL: null,
        videoStream: null,
        audioStream: null,
        screenStream: null,
        audioLevel: 0,
        role: "participant" as const,
        isHost: false,
      };
      // Strip undefined values so they don't overwrite existing fields
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      map.set(socketId, { ...existing, ...clean });
      return { remoteStreams: map };
    }),
  removeRemoteStream: (socketId) =>
    set((s) => {
      const map = new Map(s.remoteStreams);
      map.delete(socketId);
      return { remoteStreams: map };
    }),
  setMicOn: (isMicOn) => set({ isMicOn }),
  setCameraOn: (isCameraOn) => set({ isCameraOn }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setMessages: (messages) => set({ messages }),
  setTyping: (socketId, name, isTyping) =>
    set((s) => {
      const map = new Map(s.typingUsers);
      if (isTyping) map.set(socketId, name);
      else map.delete(socketId);
      return { typingUsers: map };
    }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  resetUnread: () => set({ unreadCount: 0 }),
  addReaction: (r) => set((s) => ({ reactions: [...s.reactions, r] })),
  removeReaction: (id) =>
    set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })),
  setWaitingList: (waitingList) => set({ waitingList }),
  addWaiting: (e) => set((s) => ({ waitingList: [...s.waitingList, e] })),
  removeWaiting: (socketId) =>
    set((s) => ({
      waitingList: s.waitingList.filter((w) => w.socketId !== socketId),
    })),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  setChatOpen: (isChatOpen) => set({ isChatOpen }),
  setParticipantsOpen: (isParticipantsOpen) => set({ isParticipantsOpen }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setPinnedSocketId: (pinnedSocketId) => set({ pinnedSocketId }),
  setActiveSpeaker: (activeSpeakerSocketId) => set({ activeSpeakerSocketId }),
  reset: () =>
    set({ ...initialState, remoteStreams: new Map(), typingUsers: new Map() }),
}));

// import type { Participant, ChatMessage, RoomMeta, WaitingEntry, ReactionEvent, LayoutMode } from '../types';

// interface MeetingState {
//   room: RoomMeta | null;
//   participants: Map<string, Participant>;
//   localParticipant: Participant | null;
//   chatMessages: ChatMessage[];
//   unreadChatCount: number;
//   waitingList: WaitingEntry[];
//   reactions: ReactionEvent[];
//   layoutMode: LayoutMode;
//   pinnedSocketId: string | null;
//   spotlightSocketId: string | null;
//   isChatOpen: boolean;
//   isParticipantsOpen: boolean;
//   isWaiting: boolean;
//   isReconnecting: boolean;
//   meetingStartTime: number | null; // server-aligned timestamp
//   isRecording: boolean;

//   // Actions
//   setRoom: (room: RoomMeta | null) => void;
//   setLocalParticipant: (p: Participant | null) => void;
//   addParticipant: (p: Participant) => void;
//   removeParticipant: (socketId: string) => void;
//   updateParticipant: (socketId: string, updates: Partial<Participant>) => void;
//   setParticipants: (list: Participant[]) => void;
//   addChatMessage: (msg: ChatMessage) => void;
//   setChatHistory: (msgs: ChatMessage[]) => void;
//   markChatRead: () => void;
//   addWaiting: (entry: WaitingEntry) => void;
//   removeWaiting: (socketId: string) => void;
//   addReaction: (r: ReactionEvent) => void;
//   removeReaction: (timestamp: number) => void;
//   setLayoutMode: (mode: LayoutMode) => void;
//   setPinned: (socketId: string | null) => void;
//   setSpotlight: (socketId: string | null) => void;
//   toggleChat: () => void;
//   toggleParticipants: () => void;
//   setIsWaiting: (v: boolean) => void;
//   setIsReconnecting: (v: boolean) => void;
//   setMeetingStartTime: (t: number) => void;
//   setIsRecording: (v: boolean) => void;
//   reset: () => void;
// }

// const initialState = {
//   room: null,
//   participants: new Map(),
//   localParticipant: null,
//   chatMessages: [],
//   unreadChatCount: 0,
//   waitingList: [],
//   reactions: [],
//   layoutMode: 'grid' as LayoutMode,
//   pinnedSocketId: null,
//   spotlightSocketId: null,
//   isChatOpen: false,
//   isParticipantsOpen: false,
//   isWaiting: false,
//   isReconnecting: false,
//   meetingStartTime: null,
//   isRecording: false,
// };

// export const useMeetingStore = create<MeetingState>((set, get) => ({
//   ...initialState,

//   setRoom: (room) => set({ room }),
//   setLocalParticipant: (p) => set({ localParticipant: p }),

//   addParticipant: (p) =>
//     set((s) => {
//       const next = new Map(s.participants);
//       next.set(p.socketId, p);
//       return { participants: next };
//     }),

//   removeParticipant: (socketId) =>
//     set((s) => {
//       const next = new Map(s.participants);
//       next.delete(socketId);
//       return { participants: next };
//     }),

//   updateParticipant: (socketId, updates) =>
//     set((s) => {
//       const next = new Map(s.participants);
//       const existing = next.get(socketId);
//       if (existing) next.set(socketId, { ...existing, ...updates });
//       return { participants: next };
//     }),

//   setParticipants: (list) => {
//     const map = new Map<string, Participant>();
//     list.forEach((p) => map.set(p.socketId, p));
//     set({ participants: map });
//   },

//   addChatMessage: (msg) =>
//     set((s) => ({
//       chatMessages: [...s.chatMessages, msg],
//       unreadChatCount: s.isChatOpen ? 0 : s.unreadChatCount + 1,
//     })),

//   setChatHistory: (msgs) => set({ chatMessages: msgs }),
//   markChatRead: () => set({ unreadChatCount: 0 }),

//   addWaiting: (entry) =>
//     set((s) => ({ waitingList: [...s.waitingList.filter((w) => w.socketId !== entry.socketId), entry] })),

//   removeWaiting: (socketId) =>
//     set((s) => ({ waitingList: s.waitingList.filter((w) => w.socketId !== socketId) })),

//   addReaction: (r) => set((s) => ({ reactions: [...s.reactions, r] })),
//   removeReaction: (timestamp) =>
//     set((s) => ({ reactions: s.reactions.filter((r) => r.timestamp !== timestamp) })),

//   setLayoutMode: (mode) => set({ layoutMode: mode }),
//   setPinned: (socketId) => set({ pinnedSocketId: socketId }),
//   setSpotlight: (socketId) => set({ spotlightSocketId: socketId }),
//   toggleChat: () =>
//     set((s) => ({ isChatOpen: !s.isChatOpen, unreadChatCount: !s.isChatOpen ? 0 : s.unreadChatCount })),
//   toggleParticipants: () => set((s) => ({ isParticipantsOpen: !s.isParticipantsOpen })),
//   setIsWaiting: (v) => set({ isWaiting: v }),
//   setIsReconnecting: (v) => set({ isReconnecting: v }),
//   setMeetingStartTime: (t) => set({ meetingStartTime: t }),
//   setIsRecording: (v) => set({ isRecording: v }),

//   reset: () => set({ ...initialState, participants: new Map() }),
// }));
