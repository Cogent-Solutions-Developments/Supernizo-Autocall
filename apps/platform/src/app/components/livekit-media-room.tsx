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
          border: 1px solid rgba(171, 229, 237, 0.19);
          border-radius: 18px;
          box-shadow: 0 16px 34px rgba(0, 8, 16, 0.3);
          min-height: 230px;
          overflow: hidden;
          position: relative;
          width: 100%;
        }
        .remote-video {
          background: linear-gradient(145deg, #09283b, #03131f);
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
          color: #80a4af;
          display: flex;
          flex-direction: column;
          font:
            11px/1.45 Arial,
            sans-serif;
          height: 100%;
          justify-content: center;
          padding: 24px 74px 24px 24px;
          text-align: center;
        }
        .remote-placeholder strong {
          color: #dceef2;
          font-size: 13px;
          margin: 10px 0 3px;
        }
        .placeholder-icon {
          align-items: center;
          background: rgba(121, 197, 210, 0.11);
          border: 1px solid rgba(164, 222, 231, 0.13);
          border-radius: 50%;
          color: #9bc5ce;
          display: flex;
          height: 50px;
          justify-content: center;
          width: 50px;
        }
        .local-video {
          background: #061725;
          border: 2px solid rgba(229, 250, 252, 0.85);
          border-radius: 13px;
          bottom: 12px;
          box-shadow: 0 10px 28px rgba(0, 7, 13, 0.5);
          height: 94px;
          overflow: hidden;
          position: absolute;
          right: 12px;
          width: 76px;
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
          background: rgba(1, 13, 22, 0.62);
          border-radius: 999px;
          bottom: 10px;
          color: #e7f7fa;
          font:
            700 9px/1 Arial,
            sans-serif;
          left: 10px;
          max-width: calc(100% - 112px);
          overflow: hidden;
          padding: 5px 8px;
          position: absolute;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .local-label {
          bottom: 6px;
          left: 6px;
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
          gap: 14px;
          position: relative;
          z-index: 2;
        }
        :global(.connection-status) {
          align-items: center;
          border-bottom: 1px solid rgba(162, 221, 232, 0.12);
          color: #8fadb7;
          display: flex;
          font:
            11px/1.4 Arial,
            sans-serif;
          gap: 7px;
          padding: 0 2px 11px;
        }
        :global(.connection-status time) {
          color: #d7eaee;
          font-variant-numeric: tabular-nums;
          margin-left: auto;
        }
        :global(.status-dot) {
          background: #e5aa4d;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(229, 170, 77, 0.1);
          height: 7px;
          width: 7px;
        }
        :global(.status-dot.connected) {
          background: #35e0ac;
          box-shadow: 0 0 0 3px rgba(53, 224, 172, 0.1);
        }
        .media-error {
          background: rgba(190, 53, 69, 0.16);
          border: 1px solid rgba(255, 164, 170, 0.28);
          border-radius: 11px;
          color: #ffc6cb;
          font:
            11px/1.4 Arial,
            sans-serif;
          margin: 0;
          padding: 8px 10px;
        }
        :global(button.enable-audio) {
          appearance: none;
          background: linear-gradient(135deg, #44dbc9, #25a9c4);
          border: 0;
          border-radius: 999px;
          box-shadow: 0 8px 20px rgba(39, 185, 190, 0.22);
          color: #02121d;
          cursor: pointer;
          font:
            700 11px/1 Arial,
            sans-serif;
          justify-self: center;
          padding: 10px 16px;
        }
        .media-controls {
          display: flex;
          gap: 34px;
          justify-content: center;
          padding: 0 0 8px;
        }
        .control-item {
          align-items: center;
          color: #9dbbc4;
          display: flex;
          flex-direction: column;
          font:
            700 10px/1 Arial,
            sans-serif;
          gap: 8px;
        }
        :global(button.supernizo-media-toggle),
        .end-call {
          align-items: center;
          appearance: none;
          background: rgba(138, 201, 215, 0.11);
          border: 1px solid rgba(167, 222, 232, 0.2);
          border-radius: 50%;
          box-sizing: border-box;
          color: #d8edf1;
          cursor: pointer;
          display: flex;
          flex: 0 0 64px;
          height: 64px;
          justify-content: center;
          padding: 0;
          transition:
            transform 0.16s ease,
            background 0.16s ease;
          width: 64px;
        }
        :global(button.supernizo-media-toggle:hover),
        .end-call:hover {
          background: rgba(138, 201, 215, 0.18);
          transform: translateY(-1px);
        }
        :global(button.supernizo-media-toggle[data-lk-enabled='false']) {
          background: rgba(244, 97, 112, 0.13);
          border-color: rgba(255, 150, 160, 0.24);
          color: #ffc2c8;
        }
        .end-call {
          background: linear-gradient(145deg, #ff5265, #db1d46);
          border-color: transparent;
          box-shadow: 0 10px 22px rgba(221, 33, 71, 0.22);
          color: #fff;
        }
        .end-call:hover {
          background: linear-gradient(145deg, #ff6172, #e5224c);
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
