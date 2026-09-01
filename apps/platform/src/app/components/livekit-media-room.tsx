'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackLoop,
  TrackRefContext,
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
  onEnd: () => void;
}>;

function VideoTiles() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  return (
    <div className="grid min-h-48 grid-cols-1 gap-3 sm:grid-cols-2">
      <TrackLoop tracks={tracks}>
        <TrackRefContext.Consumer>
          {(track) =>
            track ? (
              <div className="overflow-hidden rounded-xl bg-slate-950">
                {track.publication ? (
                  <VideoTrack className="h-48 w-full object-cover" trackRef={track} />
                ) : (
                  <p className="grid h-48 place-items-center text-sm text-slate-300">
                    Camera is off
                  </p>
                )}
              </div>
            ) : null
          }
        </TrackRefContext.Consumer>
      </TrackLoop>
    </div>
  );
}

export function LiveKitMediaRoom({ call, media, onEnd }: LiveKitMediaRoomProps) {
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
        {videoEnabled ? <VideoTiles /> : null}
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
