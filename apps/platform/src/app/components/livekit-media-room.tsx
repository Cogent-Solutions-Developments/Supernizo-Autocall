'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  VideoTrack,
  isTrackReference,
  useRemoteParticipants,
  useTracks,
} from '@livekit/components-react';
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@phosphor-icons/react';
import { Track, type LocalTrack, type Room } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

import type { Call, LiveKitTokenResponse } from '@supernizo/shared';

import { deriveLiveKitMediaState, getLiveKitMediaErrorMessage } from './livekit-media-state';

type LiveKitMediaRoomProps = Readonly<{
  call: Call;
  localTracks: readonly LocalTrack[];
  media: LiveKitTokenResponse;
  onConnected?: () => void;
  onEnd: () => void;
  room: Room;
}>;

function VideoTiles({ agentName }: Readonly<{ agentName: string }>) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const remoteTrack = tracks.find(
    (track) =>
      !track.participant.isLocal &&
      isTrackReference(track) &&
      track.publication.isSubscribed &&
      track.publication.track,
  );
  const localTrack = tracks.find(
    (track) => track.participant.isLocal && isTrackReference(track) && track.publication.track,
  );

  return (
    <div className="video-stage">
      <div className="remote-video">
        {remoteTrack && isTrackReference(remoteTrack) ? (
          <VideoTrack className="supernizo-remote-video" trackRef={remoteTrack} />
        ) : (
          <div className="remote-placeholder">
            <span className="placeholder-icon">
              <VideoCameraSlashIcon aria-hidden="true" size={25} weight="fill" />
            </span>
            <strong>Waiting for {agentName}&apos;s video</strong>
            <span>The call remains connected while their camera starts.</span>
          </div>
        )}
        <span className="participant-label">{agentName}</span>
      </div>

      <div className="local-video">
        {localTrack && isTrackReference(localTrack) ? (
          <VideoTrack className="supernizo-local-video" trackRef={localTrack} />
        ) : (
          <div className="local-placeholder">
            <VideoCameraSlashIcon aria-hidden="true" size={20} weight="fill" />
          </div>
        )}
        <span className="participant-label local-label">You</span>
      </div>

      <style jsx>{`
        .video-stage {
          aspect-ratio: 4 / 3;
          background: #020d16;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 220px;
          min-height: 0;
          overflow: hidden;
          position: relative;
          width: 100%;
        }
        .remote-video {
          background: linear-gradient(145deg, #18324d, #0f2740);
          height: 100%;
          position: relative;
          width: 100%;
        }
        :global(.supernizo-remote-video) {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
        .remote-placeholder {
          align-items: center;
          color: #cbd5e1;
          display: flex;
          flex-direction: column;
          font:
            11px/1.45 Arial,
            sans-serif;
          height: 100%;
          justify-content: center;
          padding: 16px 56px 16px 16px;
          text-align: center;
        }
        .remote-placeholder strong {
          color: #f8fafc;
          font-size: 11px;
          margin: 10px 0 3px;
        }
        .placeholder-icon {
          align-items: center;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 50%;
          color: #e2e8f0;
          display: flex;
          height: 38px;
          justify-content: center;
          width: 38px;
        }
        .local-video {
          background: #061725;
          border: 2px solid #fff;
          border-radius: 10px;
          bottom: 8px;
          box-shadow: 0 8px 18px rgba(0, 7, 13, 0.38);
          height: 70px;
          overflow: hidden;
          position: absolute;
          right: 8px;
          width: 56px;
          z-index: 2;
        }
        :global(.supernizo-local-video) {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
        .local-placeholder {
          align-items: center;
          color: #789aa5;
          display: flex;
          height: 100%;
          justify-content: center;
        }
        .participant-label {
          backdrop-filter: blur(8px);
          background: rgba(15, 39, 64, 0.74);
          border-radius: 999px;
          bottom: 7px;
          color: #f8fafc;
          font:
            700 9px/1 Arial,
            sans-serif;
          left: 7px;
          max-width: calc(100% - 78px);
          overflow: hidden;
          padding: 4px 6px;
          position: absolute;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .local-label {
          bottom: 4px;
          left: 4px;
          max-width: calc(100% - 12px);
          padding: 4px 6px;
        }
      `}</style>
    </div>
  );
}

function MediaConnectionStatus({
  onConnected,
  transportConnected,
  videoEnabled,
}: Readonly<{
  onConnected: (() => void) | undefined;
  transportConnected: boolean;
  videoEnabled: boolean;
}>) {
  const remoteParticipants = useRemoteParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);
  const cameraTracks = useTracks([Track.Source.Camera]);
  const localMicrophonePublished = audioTracks.some(
    (track) => track.participant.isLocal && Boolean(track.publication.track),
  );
  const remoteMicrophoneSubscribed = audioTracks.some(
    (track) =>
      !track.participant.isLocal &&
      track.publication.isSubscribed &&
      Boolean(track.publication.track),
  );
  const remoteCameraSubscribed = cameraTracks.some(
    (track) =>
      !track.participant.isLocal &&
      track.publication.isSubscribed &&
      Boolean(track.publication.track),
  );
  const mediaState = deriveLiveKitMediaState({
    localMicrophonePublished,
    remoteCameraSubscribed,
    remoteMicrophoneSubscribed,
    remoteParticipantPresent: remoteParticipants.length > 0,
    transportConnected,
    videoEnabled,
  });
  const connectedAt = useRef<number | null>(null);
  const connectedNotified = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!mediaState.connected) return;
    if (connectedAt.current === null) connectedAt.current = Date.now();
    if (!connectedNotified.current) {
      connectedNotified.current = true;
      onConnected?.();
    }
    const timer = window.setInterval(() => {
      if (connectedAt.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - connectedAt.current) / 1_000));
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [mediaState.connected, onConnected]);

  const duration = `${Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <>
      <div className="connection-status">
        <span
          aria-hidden="true"
          className={mediaState.connected ? 'status-dot connected' : 'status-dot'}
        />
        <span>{mediaState.message}</span>
        {mediaState.connected ? <time>{duration}</time> : null}
      </div>
      <StartAudio className="enable-audio" label="Enable call audio" />
    </>
  );
}

export function LiveKitMediaRoom({
  call,
  localTracks,
  media,
  onConnected,
  onEnd,
  room,
}: LiveKitMediaRoomProps) {
  const videoEnabled = call.type === 'VIDEO';
  const [error, setError] = useState<string | null>(null);
  const [transportConnected, setTransportConnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(videoEnabled);
  const ended = useRef(false);
  const publishedTracks = useRef(new Set<LocalTrack>());

  useEffect(() => {
    publishedTracks.current.clear();
  }, [call.id, room]);

  useEffect(() => {
    if (!transportConnected) return;
    const hasMicrophone = localTracks.some((track) => track.kind === Track.Kind.Audio);
    const hasCamera = localTracks.some((track) => track.kind === Track.Kind.Video);
    if (!hasMicrophone || (videoEnabled && !hasCamera)) return;

    let active = true;
    const unpublishedTracks = localTracks.filter((track) => !publishedTracks.current.has(track));
    if (unpublishedTracks.length === 0) return;

    // Reserve each track before the asynchronous publish starts. React can rerun
    // this effect while publication is in flight; reserving avoids a duplicate
    // publish request for the same camera or microphone track.
    unpublishedTracks.forEach((track) => publishedTracks.current.add(track));

    void Promise.all(
      unpublishedTracks.map(async (track) => {
        try {
          await room.localParticipant.publishTrack(track);
        } catch (publishError: unknown) {
          publishedTracks.current.delete(track);
          throw publishError;
        }
      }),
    ).catch((publishError: unknown) => {
      if (active) setError(getLiveKitMediaErrorMessage(publishError));
    });

    return () => {
      active = false;
    };
  }, [localTracks, room, transportConnected, videoEnabled]);

  function endOnce(): void {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  }

  return (
    <LiveKitRoom
      audio={false}
      className="supernizo-livekit-room"
      connect
      onConnected={() => {
        setError(null);
        setTransportConnected(true);
      }}
      onDisconnected={() => {
        setTransportConnected(false);
        endOnce();
      }}
      onError={(mediaError) => setError(getLiveKitMediaErrorMessage(mediaError))}
      onMediaDeviceFailure={(failure) => setError(getLiveKitMediaErrorMessage(failure))}
      room={room}
      serverUrl={media.url}
      token={media.token}
      video={false}
    >
      <div className="media-room">
        <MediaConnectionStatus
          onConnected={onConnected}
          transportConnected={transportConnected}
          videoEnabled={videoEnabled}
        />
        {error ? <p className="media-error">{error}</p> : null}
        {videoEnabled ? <VideoTiles agentName={call.agentDisplayName || 'Event team'} /> : null}
        <RoomAudioRenderer />
        <div className="media-controls">
          <div className="control-item">
            <TrackToggle
              aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              className="supernizo-media-toggle"
              onChange={setMicrophoneEnabled}
              showIcon={false}
              source={Track.Source.Microphone}
            >
              {microphoneEnabled ? (
                <MicrophoneIcon aria-hidden="true" size={24} weight="fill" />
              ) : (
                <MicrophoneSlashIcon aria-hidden="true" size={24} weight="fill" />
              )}
            </TrackToggle>
            <span>{microphoneEnabled ? 'Mute' : 'Unmute'}</span>
          </div>
          {videoEnabled ? (
            <div className="control-item">
              <TrackToggle
                aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                className="supernizo-media-toggle"
                onChange={setCameraEnabled}
                showIcon={false}
                source={Track.Source.Camera}
              >
                {cameraEnabled ? (
                  <VideoCameraIcon aria-hidden="true" size={24} weight="fill" />
                ) : (
                  <VideoCameraSlashIcon aria-hidden="true" size={24} weight="fill" />
                )}
              </TrackToggle>
              <span>{cameraEnabled ? 'Camera off' : 'Camera on'}</span>
            </div>
          ) : null}
          <div className="control-item">
            <button aria-label="End call" className="end-call" onClick={endOnce} type="button">
              <PhoneDisconnectIcon aria-hidden="true" size={25} weight="fill" />
            </button>
            <span>End</span>
          </div>
        </div>
      </div>
      <style jsx>{`
        :global(.supernizo-livekit-room.lk-room-container) {
          background: transparent;
          flex: 0 0 auto;
          height: auto;
          line-height: normal;
          position: static;
          width: 100%;
        }
        .media-room {
          display: grid;
          gap: 10px;
          position: relative;
          z-index: 2;
        }
        :global(.connection-status) {
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          color: #64748b;
          display: flex;
          font:
            11px/1.4 Arial,
            sans-serif;
          gap: 7px;
          padding: 0 2px 9px;
        }
        :global(.connection-status time) {
          color: #475569;
          font-variant-numeric: tabular-nums;
          margin-left: auto;
        }
        :global(.status-dot) {
          background: #f59e0b;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
          height: 7px;
          width: 7px;
        }
        :global(.status-dot.connected) {
          background: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
        }
        .media-error {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 11px;
          color: #be123c;
          font:
            11px/1.4 Arial,
            sans-serif;
          margin: 0;
          padding: 8px 10px;
        }
        :global(button.enable-audio) {
          appearance: none;
          background: #18324d;
          border: 0;
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(24, 50, 77, 0.18);
          color: #fff;
          cursor: pointer;
          font:
            700 11px/1 Arial,
            sans-serif;
          justify-self: center;
          padding: 10px 16px;
        }
        .media-controls {
          display: flex;
          gap: 24px;
          justify-content: center;
          padding: 0 0 2px;
        }
        .control-item {
          align-items: center;
          color: #64748b;
          display: flex;
          flex-direction: column;
          font:
            700 10px/1 Arial,
            sans-serif;
          gap: 6px;
        }
        :global(button.supernizo-media-toggle),
        .end-call {
          align-items: center;
          appearance: none;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 50%;
          box-sizing: border-box;
          color: #18324d;
          cursor: pointer;
          display: flex;
          flex: 0 0 54px;
          height: 54px;
          justify-content: center;
          padding: 0;
          transition:
            transform 0.16s ease,
            background 0.16s ease;
          width: 54px;
        }
        :global(button.supernizo-media-toggle:hover),
        .end-call:hover {
          background: #eef2f7;
          transform: translateY(-1px);
        }
        :global(button.supernizo-media-toggle[data-lk-enabled='false']) {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #e11d48;
        }
        .end-call {
          background: #e11d48;
          border-color: transparent;
          box-shadow: 0 8px 18px rgba(225, 29, 72, 0.18);
          color: #fff;
        }
        .end-call:hover {
          background: #be123c;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(button.supernizo-media-toggle),
          .end-call {
            transition: none;
          }
        }
      `}</style>
    </LiveKitRoom>
  );
}
