'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalTrack, Room } from 'livekit-client';

import type { CallType } from '@supernizo/shared';

import {
  captureCallMediaTracks,
  createPreparedCallRoom,
  stopCallMediaTracks,
} from './livekit-call-session';

type CallSessionInput = Readonly<{
  callId: string;
  token?: string | undefined;
  url: string;
}>;

type ActiveSession = Readonly<{
  callId: string;
  room: Room;
}> & {
  captureAttempt?: Promise<readonly LocalTrack[]> | undefined;
  tracks: readonly LocalTrack[];
};

export type LiveKitCallSession = Readonly<{
  captureError: unknown;
  captureLocalTracks: (type: CallType) => Promise<readonly LocalTrack[]>;
  isCapturing: boolean;
  localTracks: readonly LocalTrack[];
  releaseLocalTracks: () => void;
  room: Room | null;
}>;

export function useLiveKitCallSession(input: CallSessionInput | null): LiveKitCallSession {
  const activeSession = useRef<ActiveSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [localTracks, setLocalTracks] = useState<readonly LocalTrack[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<unknown>(null);
  const callId = input?.callId ?? null;
  const token = input?.token;
  const url = input?.url ?? null;

  useEffect(() => {
    if (!callId || !url) {
      activeSession.current = null;
      void Promise.resolve().then(() => {
        if (activeSession.current !== null) return;
        setRoom(null);
        setLocalTracks([]);
        setIsCapturing(false);
        setCaptureError(null);
      });
      return;
    }

    const prepared = createPreparedCallRoom(url, token);
    const session: ActiveSession = { callId, room: prepared.room, tracks: [] };
    activeSession.current = session;
    void Promise.resolve().then(() => {
      if (activeSession.current !== session) return;
      setRoom(prepared.room);
      setLocalTracks([]);
      setIsCapturing(false);
      setCaptureError(null);
    });
    void prepared.preparation;

    return () => {
      if (activeSession.current === session) activeSession.current = null;
      stopCallMediaTracks(session.tracks);
      void session.room.disconnect();
    };
  }, [callId, token, url]);

  const releaseLocalTracks = useCallback(() => {
    const session = activeSession.current;
    if (!session) return;
    session.captureAttempt = undefined;
    stopCallMediaTracks(session.tracks);
    session.tracks = [];
    setLocalTracks([]);
    setIsCapturing(false);
  }, []);

  const captureLocalTracks = useCallback(async (type: CallType) => {
    const session = activeSession.current;
    if (!session) throw new Error('The secure media room is not ready.');
    if (session.tracks.length > 0) return session.tracks;
    if (session.captureAttempt) return session.captureAttempt;

    setCaptureError(null);
    setIsCapturing(true);
    const captureAttempt = captureCallMediaTracks(type);
    session.captureAttempt = captureAttempt;

    try {
      const capturedTracks = await captureAttempt;
      if (activeSession.current !== session || session.captureAttempt !== captureAttempt) {
        stopCallMediaTracks(capturedTracks);
        return [];
      }
      session.tracks = capturedTracks;
      setLocalTracks(capturedTracks);
      return capturedTracks;
    } catch (error: unknown) {
      if (activeSession.current === session) setCaptureError(error);
      throw error;
    } finally {
      if (activeSession.current === session && session.captureAttempt === captureAttempt) {
        session.captureAttempt = undefined;
        setIsCapturing(false);
      }
    }
  }, []);

  return {
    captureError,
    captureLocalTracks,
    isCapturing,
    localTracks,
    releaseLocalTracks,
    room,
  };
}
