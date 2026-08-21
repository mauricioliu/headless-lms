"use client";
// Vidstack island for the static video node. Emits media facts to the host's
// MediaTracking context; plays plain progressive sources (no hls.js). The
// resume/retry choreography lives in media-playback.ts, tested there.
import { useEffect, useRef, useState } from "react";
import {
  MediaPlayer,
  MediaProvider as VidstackMediaProvider,
  type MediaPlayerInstance,
  type MediaTimeUpdateEventDetail,
} from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { useMediaTracking, type MediaTrackingEvent } from "../media";
import {
  captureError,
  consumeSeekSuppression,
  createResumeState,
  gateRate,
  gateSeek,
  resumeTarget,
  videoMimeType,
} from "./media-playback";

export function MediaVideoPlayer({
  assetId,
  url,
  name,
}: {
  assetId?: string;
  url: string;
  name?: string;
}) {
  const { onEvent, startPosition, refreshUrl, playbackPolicy } = useMediaTracking();
  const playerRef = useRef<MediaPlayerInstance>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(createResumeState());
  const [src, setSrc] = useState(url);

  const clipSeek = (target: number) => {
    const policy = assetId ? playbackPolicy?.(assetId) : undefined;
    return gateSeek(target, policy?.seekCeiling);
  };
  const clipSeekRef = useRef(clipSeek);
  clipSeekRef.current = clipSeek;

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const onSeekRequest = (event: Event) => {
      const time = (event as Event & { detail?: unknown }).detail;
      if (typeof time !== "number") return;
      const clamped = clipSeekRef.current(time);
      if (clamped != null) {
        event.preventDefault();
        playerRef.current?.remoteControl.seek(clamped);
      }
    };
    root.addEventListener("media-seek-request", onSeekRequest, true);
    return () => root.removeEventListener("media-seek-request", onSeekRequest, true);
  }, []);

  const duration = () => {
    const raw = playerRef.current?.duration;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
  };
  const emit = (kind: MediaTrackingEvent["kind"], seconds: number) => {
    if (!assetId || !onEvent) return;
    onEvent({ assetId, kind, seconds, duration: duration() });
  };

  return (
    <div ref={hostRef} className="w-full">
      <MediaPlayer
        ref={playerRef}
        className="overflow-hidden rounded-sm"
        src={{ src, type: videoMimeType(name) }}
        playsInline
        onCanPlay={() => {
          const saved = assetId ? startPosition?.(assetId) : undefined;
          const { target, next } = resumeTarget(stateRef.current, saved, duration());
          stateRef.current = next;
          if (target != null && playerRef.current) {
            playerRef.current.currentTime = target;
          }
        }}
        onPlay={() => emit("play", playerRef.current?.currentTime ?? 0)}
        onPause={() => emit("pause", playerRef.current?.currentTime ?? 0)}
        onSeeked={() => {
          const { report, next } = consumeSeekSuppression(stateRef.current);
          stateRef.current = next;
          if (report) {
            emit("seeked", playerRef.current?.currentTime ?? 0);
          }
        }}
        onSeeking={(target: number) => {
          // Consulted at event time; the corrective seek re-fires seeking at the
          // ceiling, which the gate then allows — self-terminating. The
          // correction goes through remoteControl: the currentTime setter can
          // silently drop the write when it equals the throttled internal
          // signal, letting the user's forward seek land.
          const clamped = clipSeek(target);
          if (clamped != null && playerRef.current) {
            playerRef.current.remoteControl.seek(clamped);
          }
        }}
        onRateChange={(rate: number) => {
          const policy = assetId ? playbackPolicy?.(assetId) : undefined;
          const capped = gateRate(rate, policy?.maxRate);
          if (capped != null && playerRef.current) {
            playerRef.current.playbackRate = capped;
          }
        }}
        onEnded={() => emit("ended", playerRef.current?.duration ?? 0)}
        onTimeUpdate={(detail: MediaTimeUpdateEventDetail) =>
          emit("timeupdate", detail.currentTime)
        }
        onError={() => {
          const { retry, next } = captureError(stateRef.current, playerRef.current?.currentTime);
          stateRef.current = next;
          if (retry && assetId && refreshUrl) {
            void refreshUrl(assetId)
              .then((fresh) => {
                if (fresh) setSrc(fresh);
              })
              .catch(() => {});
          }
        }}
      >
        <VidstackMediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
