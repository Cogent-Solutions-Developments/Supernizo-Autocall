import type { CallStatus } from '@supernizo/shared';
import type { JsonValue } from './json-value';
export type FindTokenCallResult = null | {
  id: string;
  visitorId: string;
  sessionId: null | string;
  agentId: null | string;
  status: CallStatus;
  roomName: null | string;
};

export type FindRoomCallResult = null | {
  id: string;
  visitorId: string;
  agentId: null | string;
  status: CallStatus;
};

export type RecordMediaEventResult = {
  id: string;
  type: string;
  createdAt: Date;
  payload: JsonValue;
  callId: string;
};

export type GetCallStatusResult = null | {
  status: CallStatus;
};

export interface LivekitTokenRepositorySession {
  findTokenCall(callId: string): Promise<FindTokenCallResult>;
  findRoomCall(input: {
    event:
      | 'participant_joined'
      | 'participant_left'
      | 'participant_connection_aborted'
      | 'room_finished'
      | 'track_published'
      | 'track_unpublished';
    participantIdentity?: undefined | string;
    roomName: string;
    trackMuted?: undefined | false | true;
    trackName?: undefined | string;
    trackSid?: undefined | string;
    trackSource?: undefined | string;
    trackType?: undefined | string;
    webhookEventId?: undefined | string;
  }): Promise<FindRoomCallResult>;
  listMediaEvents(call: {
    id: string;
    visitorId: string;
    agentId: null | string;
    status: CallStatus;
  }): Promise<Array<{ type: string; payload: JsonValue }>>;
  recordMediaEvent(
    call: {
      id: string;
      visitorId: string;
      agentId: null | string;
      status: CallStatus;
    },
    input: {
      event:
        | 'participant_joined'
        | 'participant_left'
        | 'participant_connection_aborted'
        | 'room_finished'
        | 'track_published'
        | 'track_unpublished';
      participantIdentity?: undefined | string;
      roomName: string;
      trackMuted?: undefined | false | true;
      trackName?: undefined | string;
      trackSid?: undefined | string;
      trackSource?: undefined | string;
      trackType?: undefined | string;
      webhookEventId?: undefined | string;
    },
    payload: {
      identity?: string;
      trackMuted?: boolean;
      trackName?: string;
      trackSid?: string;
      trackSource?: string;
      trackType?: string;
      webhookEventId?: string;
    },
  ): Promise<RecordMediaEventResult>;
  listJoinEvents(call: {
    id: string;
    visitorId: string;
    agentId: null | string;
    status: CallStatus;
  }): Promise<Array<{ payload: JsonValue }>>;
  getCallStatus(call: {
    id: string;
    visitorId: string;
    agentId: null | string;
    status: CallStatus;
  }): Promise<GetCallStatusResult>;
}
export type LivekitTokenRepository = LivekitTokenRepositorySession;
