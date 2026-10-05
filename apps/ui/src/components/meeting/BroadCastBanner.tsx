import { Radio, Users } from 'lucide-react';
import type { RoomMeta, Participant } from '../../types';
import { useMeetingStore } from '../../store/meetingStore';

interface BroadcastBannerProps {
  room: RoomMeta;
  localParticipant: Participant | null;
}

export function BroadcastBanner({ room, localParticipant }: BroadcastBannerProps) {
  const participantCount = useMeetingStore((s) => s.participants.size);
  const isBroadcaster = localParticipant?.role === 'broadcaster' || localParticipant?.role === 'host';

  return (
    <div className="broadcast-banner" role="status">
      <div className="broadcast-banner-left">
        <span className="broadcast-live-dot" aria-hidden />
        <Radio size={14} className="broadcast-icon" />
        <span className="broadcast-label">
          {isBroadcaster ? 'Broadcasting live' : `Watching: ${room.name}`}
        </span>
      </div>
      <div className="broadcast-banner-right">
        <Users size={14} />
        <span>{participantCount + 1} watching</span>
      </div>
    </div>
  );
}