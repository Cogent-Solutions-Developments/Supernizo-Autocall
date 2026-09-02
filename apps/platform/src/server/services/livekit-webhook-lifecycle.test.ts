import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callEventCreate: vi.fn(),
  callEventFindMany: vi.fn(),
  callFindUnique: vi.fn(),
  transitionCall: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  getDatabaseClient: () => ({
    call: { findUnique: mocks.callFindUnique },
    callEvent: {
      create: mocks.callEventCreate,
      findMany: mocks.callEventFindMany,
    },
  }),
}));

vi.mock('./call-service', () => ({ transitionCall: mocks.transitionCall }));
vi.mock('./tracker-engagement-service', () => ({ resolveTrackingContext: vi.fn() }));

import { handleLiveKitWebhookEvent } from './livekit-token-service';

describe('LiveKit webhook call lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callFindUnique.mockResolvedValue({
      agentId: 'user_123',
      id: 'call_123',
      status: 'CONNECTING',
      visitorId: 'visitor_123',
    });
    mocks.callEventFindMany.mockResolvedValue([]);
    mocks.callEventCreate.mockResolvedValue({ id: 'event_123' });
  });

  it('does not activate after only one expected participant joins', async () => {
    await handleLiveKitWebhookEvent({
      event: 'participant_joined',
      participantIdentity: 'agent:user_123',
      roomName: 'call_room',
      webhookEventId: 'EV_1',
    });

    expect(mocks.callEventCreate).toHaveBeenCalledOnce();
    expect(mocks.transitionCall).not.toHaveBeenCalled();
  });

  it('activates after the agent and visitor have both joined', async () => {
    mocks.callEventFindMany
      .mockResolvedValueOnce([
        {
          payload: { identity: 'agent:user_123', webhookEventId: 'EV_1' },
          type: 'LIVEKIT_PARTICIPANT_JOINED',
        },
      ])
      .mockResolvedValueOnce([
        { payload: { identity: 'agent:user_123' } },
        { payload: { identity: 'visitor:visitor_123' } },
      ]);

    await handleLiveKitWebhookEvent({
      event: 'participant_joined',
      participantIdentity: 'visitor:visitor_123',
      roomName: 'call_room',
      webhookEventId: 'EV_2',
    });

    expect(mocks.transitionCall).toHaveBeenCalledWith('call_123', 'activate', undefined, undefined);
  });

  it('moves an accepted call through connecting when both room participants have joined', async () => {
    mocks.callFindUnique.mockResolvedValue({
      agentId: 'user_123',
      id: 'call_123',
      status: 'ACCEPTED',
      visitorId: 'visitor_123',
    });
    mocks.callEventFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { payload: { identity: 'agent:user_123' } },
        { payload: { identity: 'visitor:visitor_123' } },
      ]);

    await handleLiveKitWebhookEvent({
      event: 'participant_joined',
      participantIdentity: 'visitor:visitor_123',
      roomName: 'call_room',
      webhookEventId: 'EV_accepted',
    });

    expect(mocks.transitionCall).toHaveBeenNthCalledWith(
      1,
      'call_123',
      'connect',
      undefined,
      undefined,
    );
    expect(mocks.transitionCall).toHaveBeenNthCalledWith(
      2,
      'call_123',
      'activate',
      undefined,
      undefined,
    );
  });

  it('ignores a retried webhook event without adding duplicate durable history', async () => {
    mocks.callEventFindMany.mockResolvedValue([
      {
        payload: { identity: 'agent:user_123', webhookEventId: 'EV_duplicate' },
        type: 'LIVEKIT_PARTICIPANT_JOINED',
      },
    ]);

    await handleLiveKitWebhookEvent({
      event: 'participant_joined',
      participantIdentity: 'agent:user_123',
      roomName: 'call_room',
      webhookEventId: 'EV_duplicate',
    });

    expect(mocks.callEventCreate).not.toHaveBeenCalled();
    expect(mocks.transitionCall).not.toHaveBeenCalled();
  });

  it('fails a non-terminal call when LiveKit reports an aborted media connection', async () => {
    await handleLiveKitWebhookEvent({
      event: 'participant_connection_aborted',
      participantIdentity: 'visitor:visitor_123',
      roomName: 'call_room',
      webhookEventId: 'EV_abort',
    });

    expect(mocks.transitionCall).toHaveBeenCalledWith(
      'call_123',
      'fail',
      'MEDIA_CONNECTION_ABORTED',
      undefined,
    );
  });

  it('defers non-critical operational sync when a participant leaves an active room', async () => {
    const scheduler = vi.fn();
    mocks.callFindUnique.mockResolvedValue({
      agentId: 'user_123',
      id: 'call_123',
      status: 'ACTIVE',
      visitorId: 'visitor_123',
    });

    await handleLiveKitWebhookEvent(
      {
        event: 'participant_left',
        participantIdentity: 'visitor:visitor_123',
        roomName: 'call_room',
        webhookEventId: 'EV_left',
      },
      { scheduleOperationalSync: scheduler },
    );

    expect(mocks.transitionCall).toHaveBeenCalledWith('call_123', 'end', undefined, {
      scheduleOperationalSync: scheduler,
    });
  });

  it('records but does not fail the call for an unexpected participant abort', async () => {
    await handleLiveKitWebhookEvent({
      event: 'participant_connection_aborted',
      participantIdentity: 'agent:unexpected',
      roomName: 'call_room',
      webhookEventId: 'EV_unexpected',
    });

    expect(mocks.callEventCreate).toHaveBeenCalledOnce();
    expect(mocks.transitionCall).not.toHaveBeenCalled();
  });
});
