'use client';

import {
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackLoop,
  TrackRefContext,
  VideoTrack,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useRef, useState } from 'react';

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
  const [error, setError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('Connecting media…');
  const ended = useRef(false);
  const videoEnabled = call.type === 'VIDEO';

  function endOnce(): void {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  }

  return (
    <LiveKitRoom
      audio
      connect
      onConnected={() => setConnectionMessage('Connected')}
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
      <div className="mt-4 grid gap-3" data-lk-theme="default">
        <p className="text-sm text-slate-600">{connectionMessage}</p>
        {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {videoEnabled ? <VideoTiles /> : null}
        <RoomAudioRenderer />
        <div className="flex flex-wrap items-center gap-2">
          <ControlBar
            controls={{ camera: videoEnabled, chat: false, microphone: true, screenShare: false }}
          />
          <button
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            onClick={endOnce}
            type="button"
          >
            End call
          </button>
        </div>
      </div>
    </LiveKitRoom>
  );
}
