import { Room, createLocalTracks, type LocalTrack } from 'livekit-client';

import type { CallType } from '@supernizo/shared';

import {
  requestMediaPermissions,
  type CallMediaConstraints,
} from '@/app/widget/call/media-permissions';

export type PreparedCallRoom = Readonly<{
  preparation: Promise<boolean>;
  room: Room;
}>;

type RoomFactory = () => Room;
type TrackFactory = (constraints: CallMediaConstraints) => Promise<readonly LocalTrack[]>;

function defaultRoomFactory(): Room {
  return new Room({
    adaptiveStream: true,
    disconnectOnPageLeave: true,
    dynacast: true,
  });
}

export function createPreparedCallRoom(
  url: string,
  token?: string,
  createRoom: RoomFactory = defaultRoomFactory,
): PreparedCallRoom {
  const room = createRoom();
  const preparation = room.prepareConnection(url, token).then(
    () => true,
    () => false,
  );
  return { preparation, room };
}

export async function captureCallMediaTracks(
  type: CallType,
  capture: TrackFactory = createLocalTracks,
): Promise<readonly LocalTrack[]> {
  return requestMediaPermissions(type, capture);
}

export function stopCallMediaTracks(tracks: readonly Pick<LocalTrack, 'stop'>[]): void {
  tracks.forEach((track) => track.stop());
}
