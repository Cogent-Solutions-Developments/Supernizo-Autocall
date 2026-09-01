'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  VideoTrack,
  useTracks,
} from '@livekit/components-react';
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@phosphor-icons/react';
import { Track } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

import type { Call, LiveKitTokenResponse } from '@supernizo/shared';

type LiveKitMediaRoomProps = Readonly<{
  call: Call;
  media: LiveKitTokenResponse;
  onConnected?: () => void;
  onEnd: () => void;
}>;

function VideoTiles({ agentName }: Readonly<{ agentName: string }>) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const remoteTrack =
    tracks.find((track) => !track.participant.isLocal && track.publication) ??
    tracks.find((track) => !track.participant.isLocal);
  const localTrack =
    tracks.find((track) => track.participant.isLocal && track.publication) ??
    tracks.find((track) => track.participant.isLocal);

  return (
    <div className="video-stage">
      <div className="remote-video">
        {remoteTrack?.publication ? (
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
        {localTrack?.publication ? (
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

export function LiveKitMediaRoom({ call, media, onConnected, onEnd }: LiveKitMediaRoomProps) {
  const videoEnabled = call.type === 'VIDEO';
  const [error, setError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('Connecting...');
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(videoEnabled);
  const ended = useRef(false);

  useEffect(() => {
    if (connectedAt === null) return;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [connectedAt]);

  const duration = `${Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`;

  function endOnce(): void {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  }

  return (
    <LiveKitRoom
      audio
      className="supernizo-livekit-room"
      connect
      onConnected={() => {
        setConnectionMessage('Connected');
        setConnectedAt(Date.now());
        onConnected?.();
      }}
      onDisconnected={() => {
        setConnectionMessage('Disconnected');
        endOnce();
      }}
      onError={() => setError('The media connection failed. Check your network and try again.')}
      onMediaDeviceFailure={() =>
        setError(
          'Camera or microphone permission was denied, or no compatible device is available.',
        )
      }
      serverUrl={media.url}
      token={media.token}
      video={videoEnabled}
    >
      <div className="media-room">
        <div className="connection-status">
          <span
            aria-hidden="true"
            className={connectedAt ? 'status-dot connected' : 'status-dot'}
          />
          <span>{connectionMessage}</span>
          {connectedAt ? <time>{duration}</time> : null}
        </div>
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
        .connection-status {
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
        .connection-status time {
          color: #d7eaee;
          font-variant-numeric: tabular-nums;
          margin-left: auto;
        }
        .status-dot {
          background: #e5aa4d;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(229, 170, 77, 0.1);
          height: 7px;
          width: 7px;
        }
        .status-dot.connected {
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
