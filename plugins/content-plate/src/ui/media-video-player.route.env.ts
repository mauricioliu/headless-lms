// Browser globals the Vidstack default layout reads at module load and the
// player needs at connect, none of which jsdom provides. Imported before the
// island so the layout module body sees them.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): object[] {
    return [];
  }
}

class IntersectionObserverStub {
  #cb: (entries: { isIntersecting: boolean; target: Element }[]) => void;
  constructor(cb: (entries: { isIntersecting: boolean; target: Element }[]) => void) {
    this.#cb = cb;
  }
  observe(el: Element): void {
    setTimeout(() => this.#cb([{ isIntersecting: true, target: el }]), 0);
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): object[] {
    return [];
  }
}

window.VTTCue = class {
  startTime: number;
  endTime: number;
  text: string;
  constructor(startTime = 0, endTime = 0, text = "") {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
} as unknown as typeof VTTCue;

HTMLMediaElement.prototype.load = () => {};
HTMLMediaElement.prototype.pause = () => {};

const memoryStorage = new Map<string, string>();

window.localStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void memoryStorage.set(k, v),
  removeItem: (k: string) => void memoryStorage.delete(k),
  clear: () => memoryStorage.clear(),
  key: () => null,
  get length() {
    return memoryStorage.size;
  },
} as Storage;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(() => {
    if (typeof window === "undefined") return;
    cb(Date.now());
  }, 0) as unknown as number) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = ((id: number) =>
  clearTimeout(
    id as unknown as ReturnType<typeof setTimeout>,
  )) as typeof window.cancelAnimationFrame;

if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
    }
  } as typeof PointerEvent;
}
