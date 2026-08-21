// @vitest-environment jsdom
// Full-route gate test: renderer → island → MediaProvider → player, against
// the real Vidstack event machinery (state manager with its throttled
// `seeking` handler, request queue, equality-guarded currentTime setter).
// The <video> element is jsdom's; its media pipeline is driven by hand.
import "./media-video-player.route.env";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createSlateEditor, KEYS } from "platejs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaPlayerInstance } from "@vidstack/react";
import type { ComponentProps } from "react";
import type { MediaTrackingEvent } from "@headless-lms/editor";

import { BaseEditorKit } from "../editor/editor-base-kit";
import { MediaProvider } from "../media";
import { MediaVideoElementStatic } from "./media-video-node-static";

const DURATION = 90;
const MAX_RATE = 2;
const SEEKING_THROTTLE_MS = 150;

/** Host-side watch state mirroring course-player's policy feed: a high-water
 *  mark advanced by continuous timeupdate facts, read at event time. */
const CONTINUOUS_S = 2;

interface Route {
  video: HTMLVideoElement;
  /** A bar tap as the layout delivers it: remote seek + native seeking. */
  tap(time: number): void;
  /** Pointer tap on the default layout time slider, as a Trabajador would. */
  tapSlider(percent: number): Promise<void>;
  /** Native seeking event only (no request), e.g. the correction's own. */
  seeking(time: number): void;
  seeked(time: number): void;
  /** Advance real watching to `until` at a 0.25 s timeupdate cadence. */
  watch(until: number): void;
  setRate(rate: number): void;
  furthest(): number;
  events(): MediaTrackingEvent[];
  player(): MediaPlayerInstance;
}

let root: Root | null = null;

async function mountRoute(): Promise<Route> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  let player: MediaPlayerInstance | null = null;
  host.addEventListener("media-player-connect", (e) => {
    player = (e as unknown as CustomEvent<MediaPlayerInstance>).detail;
  });

  const events: MediaTrackingEvent[] = [];
  let furthest = 0;
  let lastTick = 0;
  const onEvent = (e: MediaTrackingEvent) => {
    events.push(e);
    if (e.kind === "timeupdate" || e.kind === "seeked") {
      if (e.kind === "timeupdate") {
        const delta = e.seconds - lastTick;
        if (delta > 0 && delta <= CONTINUOUS_S) furthest = Math.max(furthest, e.seconds);
      }
      lastTick = e.seconds;
    }
  };
  const playbackPolicy = () => ({ seekCeiling: furthest, maxRate: MAX_RATE });

  const element = {
    id: "vid_1",
    type: KEYS.video,
    assetId: "asset_1",
    url: "https://media.example.com/segmento.mp4?sig=expired",
    children: [{ text: "" }],
  };
  const editor = createSlateEditor({ plugins: BaseEditorKit, value: [element] });
  const rendererNode = await MediaVideoElementStatic({
    element,
    editor,
    attributes: {},
    children: null,
    resolveAssetUrl: async () => "https://media.example.com/segmento.mp4?sig=fresh",
  } as unknown as ComponentProps<typeof MediaVideoElementStatic>);

  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MediaProvider
        onEvent={onEvent}
        playbackPolicy={playbackPolicy}
        startPosition={() => undefined}
        refreshUrl={async () => null}
      >
        {rendererNode}
      </MediaProvider>,
    );
  });

  let video: HTMLVideoElement | null = null;
  for (let i = 0; i < 50 && !video; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    video = host.querySelector("video");
  }
  if (!video) throw new Error("route never mounted a <video> element");
  if (!player) throw new Error("media-player-connect never fired");

  let time = 0;
  let rate = 1;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => time,
    set: (t: number) => {
      time = t;
    },
  });
  Object.defineProperty(video, "duration", { configurable: true, get: () => DURATION });
  Object.defineProperty(video, "seekable", {
    configurable: true,
    get: () => ({ length: 1, start: () => 0, end: () => DURATION }),
  });
  Object.defineProperty(video, "playbackRate", {
    configurable: true,
    get: () => rate,
    set: (r: number) => {
      rate = r;
    },
  });

  const fire = (type: string) => video!.dispatchEvent(new Event(type));

  const route: Route = {
    video,
    tap: (t) =>
      act(() => {
        player!.remoteControl.seek(t);
        fire("seeking");
      }),
    tapSlider: async (percent) => {
      const slider = host.querySelector("[data-media-time-slider]");
      if (!(slider instanceof HTMLElement)) {
        throw new Error("default layout time slider not mounted");
      }
      const width = 1000;
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
        width,
        height: 20,
        toJSON: () => ({}),
      } as DOMRect);
      const clientX = percent * width;
      const init: PointerEventInit = {
        button: 0,
        clientX,
        clientY: 10,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
      };
      await act(async () => {
        slider.dispatchEvent(new PointerEvent("pointerdown", init));
        await new Promise((r) => setTimeout(r, 0));
        document.dispatchEvent(new PointerEvent("pointerup", init));
      });
    },
    seeking: (t) =>
      act(() => {
        time = t;
        fire("seeking");
      }),
    seeked: (t) =>
      act(() => {
        time = t;
        fire("seeked");
      }),
    watch: (until) =>
      act(() => {
        for (let t = 0.25; t <= until; t += 0.25) {
          time = t;
          fire("timeupdate");
        }
      }),
    setRate: (r) =>
      act(() => {
        rate = r;
        fire("ratechange");
      }),
    furthest: () => furthest,
    events: () => events,
    player: () => player!,
  };
  return route;
}

async function mountReadyRoute(): Promise<Route> {
  const r = await mountRoute();
  await act(async () => {
    for (const type of ["loadstart", "loadedmetadata", "loadeddata", "durationchange", "canplay"]) {
      r.video.dispatchEvent(new Event(type));
    }
  });
  expect(r.player().state.canPlay).toBe(true);
  return r;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("video gate on the real player route", () => {
  it("mounts the renderer → island → MediaProvider → player route with a live provider", async () => {
    const r = await mountReadyRoute();
    const source = r.video.querySelector("source[data-vds]")?.getAttribute("src");
    expect(source).toContain("sig=fresh");
    expect(r.player().provider).not.toBeNull();
  });

  it("clips a first tap beyond the ceiling back to the high-water mark", async () => {
    const r = await mountReadyRoute();
    r.watch(10);
    expect(r.furthest()).toBe(10);

    r.tap(46.7);
    expect(r.video.currentTime).toBe(10);
  });

  it("clips a second tap inside the seeking-throttle window (internal signal stale)", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    r.tap(20);
    expect(r.video.currentTime).toBe(10);
    r.seeked(10);

    r.tap(85.5);
    expect(r.video.currentTime).toBe(10);
  });

  it("clips every repeated tap, not just the first", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    for (const target of [30, 60, 89]) {
      r.tap(target);
      expect(r.video.currentTime).toBe(10);
      r.seeked(10);
      await new Promise((resolve) => setTimeout(resolve, SEEKING_THROTTLE_MS + 50));
    }
  });

  it("emits no fact beyond the ceiling from a clipped seek, including the raced one", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    r.tap(20);
    r.seeked(10);
    r.tap(85.5);
    r.seeked(r.video.currentTime);
    r.watch(10.5);

    const seconds = r.events().map((e) => e.seconds);
    expect(Math.max(...seconds)).toBeLessThanOrEqual(10.5 + 1e-9);
    expect(r.furthest()).toBeLessThanOrEqual(10.5 + 1e-9);
  });

  it("always allows rewinding below the ceiling", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    r.tap(4);
    expect(r.video.currentTime).toBe(4);
  });

  it("clamps an over-limit rate through the real rate path", async () => {
    const r = await mountReadyRoute();

    r.setRate(4);
    expect(r.video.playbackRate).toBe(MAX_RATE);
  });

  it("clips a tap on the default layout time slider beyond the ceiling", async () => {
    const r = await mountReadyRoute();
    r.watch(10);
    expect(r.furthest()).toBe(10);

    const requested: number[] = [];
    const slider = document.querySelector("[data-media-time-slider]");
    expect(slider).toBeInstanceOf(HTMLElement);
    slider!.addEventListener("media-seek-request", (e) => {
      requested.push((e as CustomEvent<number>).detail);
    });

    await r.tapSlider(0.5);
    expect(requested.some((t) => t > 10)).toBe(true);
    expect(r.video.currentTime).toBe(10);
    expect(r.furthest()).toBe(10);

    requested.length = 0;
    await r.tapSlider(0.95);
    expect(requested.some((t) => t > 10)).toBe(true);
    expect(r.video.currentTime).toBe(10);
    expect(r.furthest()).toBe(10);
    expect(Math.max(...r.events().map((e) => e.seconds))).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("clips every repeated tap on the default layout time slider", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    for (const percent of [0.3, 0.6, 0.99]) {
      await r.tapSlider(percent);
      expect(r.video.currentTime).toBe(10);
    }
  });

  it("allows rewinding via the default layout time slider", async () => {
    const r = await mountReadyRoute();
    r.watch(10);

    await r.tapSlider(0.04);
    expect(r.video.currentTime).toBeCloseTo(3.6, 1);
  });

  it("sizes the player box to the asset's natural ratio at loaded-metadata", async () => {
    const r = await mountReadyRoute();
    const playerEl = document.querySelector("[data-media-player]") as HTMLElement;
    // jsdom reports no natural size: the mobile-first 9/16 CSS default stands.
    expect(playerEl.style.aspectRatio).toBe("");

    Object.defineProperty(r.video, "videoWidth", { configurable: true, get: () => 720 });
    Object.defineProperty(r.video, "videoHeight", { configurable: true, get: () => 1280 });
    await act(async () => {
      r.video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(playerEl.style.aspectRatio).toBe("720 / 1280");
  });

  it("fills the current viewport on fullscreen instead of calling the native API", async () => {
    Element.prototype.requestFullscreen ??= async () => {};
    const native = vi.spyOn(Element.prototype, "requestFullscreen").mockResolvedValue();
    const r = await mountReadyRoute();
    const playerEl = document.querySelector("[data-media-player]") as HTMLElement;

    const btn = document.querySelector(".vds-fullscreen-button") as HTMLButtonElement | null;
    await act(async () => {
      if (btn) {
        btn.click();
      } else {
        playerEl.dispatchEvent(
          new Event("media-enter-fullscreen-request", { bubbles: true, cancelable: true }),
        );
      }
    });

    expect(playerEl.classList.contains("nuvora-fs")).toBe(true);
    expect(native).not.toHaveBeenCalled();

    await act(async () => {
      const again = document.querySelector(".vds-fullscreen-button") as HTMLButtonElement | null;
      if (again) {
        again.click();
      } else {
        playerEl.dispatchEvent(
          new Event("media-exit-fullscreen-request", { bubbles: true, cancelable: true }),
        );
      }
    });
    expect(playerEl.classList.contains("nuvora-fs")).toBe(false);
  });
});
