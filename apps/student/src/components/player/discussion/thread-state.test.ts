import { describe, it, expect } from "vitest";
import type { ThreadComment, ResolvedThreadConfig } from "@/lib/api/types";
import {
  groupThread,
  initialThreadState,
  permissions,
  threadReducer,
} from "./thread-state";

const author = { id: "orm_a", name: "Ana Diaz", image: null, role: "student" as const };
const instructor = { id: "orm_s", name: "Sarah Chen", image: null, role: "instructor" as const };

function comment(over: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "cmt_1",
    parentId: null,
    author,
    isOwn: false,
    body: "hello",
    status: "published",
    removedBy: null,
    reactions: [],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...over,
  };
}

const open: ResolvedThreadConfig = {
  enabled: true,
  threaded: true,
  requireReview: false,
  reactions: true,
  state: "visible",
};

describe("groupThread", () => {
  it("nests replies under their root, one level deep", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1" });
    const nodes = groupThread([root, reply]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.comment.id).toBe("r1");
    expect(nodes[0]?.replies.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps a removed root that still has a visible reply", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    const reply = comment({ id: "p1", parentId: "r1" });
    expect(groupThread([root, reply])).toHaveLength(1);
  });

  it("drops a removed root with no visible replies", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    expect(groupThread([root])).toHaveLength(0);
  });

  it("never renders a removed reply", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1", status: "removed", body: null });
    expect(groupThread([root, reply])[0]?.replies).toHaveLength(0);
  });

  it("drops a reply whose root is gone", () => {
    expect(groupThread([comment({ id: "p1", parentId: "missing" })])).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("offers reply, react, edit and remove on an open thread", () => {
    const p = permissions(open, comment({ isOwn: true }));
    expect(p).toMatchObject({
      canReply: true,
      canReact: true,
      canEdit: true,
      canRemove: true,
      canReport: false,
    });
  });

  it("offers report on someone else's comment, never on your own", () => {
    expect(permissions(open, comment({ isOwn: false })).canReport).toBe(true);
    expect(permissions(open, comment({ isOwn: true })).canReport).toBe(false);
  });

  it("keeps reporting available on a locked thread and nothing else", () => {
    const locked = { ...open, state: "locked" as const };
    const p = permissions(locked, comment());
    expect(p.canReport).toBe(true);
    expect(p.canReply).toBe(false);
    expect(p.canReact).toBe(false);
    expect(permissions(locked, comment({ isOwn: true })).canEdit).toBe(false);
  });

  it("lets an author still remove their own comment on a locked thread", () => {
    const locked = { ...open, state: "locked" as const };
    expect(permissions(locked, comment({ isOwn: true })).canRemove).toBe(true);
  });

  it("refuses replies to a reply and to a pending comment", () => {
    expect(permissions(open, comment({ parentId: "r1" })).canReply).toBe(false);
    expect(permissions(open, comment({ status: "pending" })).canReply).toBe(false);
  });

  it("offers no reactions when the course disables them", () => {
    expect(permissions({ ...open, reactions: false }, comment()).canReact).toBe(false);
  });
});

describe("threadReducer", () => {
  it("marks the thread off when the course has discussion disabled", () => {
    const next = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("marks the thread off when the activity hides it", () => {
    const next = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: { ...open, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("marks the thread off when the course disables it even while the activity still shows it visible", () => {
    const next = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false, state: "visible" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("appends an inserted comment and replaces it once the server answers", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [] },
    });
    const optimistic = threadReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1", isOwn: true }),
    });
    expect(optimistic.comments.map((c) => c.id)).toEqual(["temp_1"]);

    const confirmed = threadReducer(optimistic, {
      kind: "replaced",
      id: "temp_1",
      comment: comment({ id: "cmt_9", isOwn: true }),
    });
    expect(confirmed.comments.map((c) => c.id)).toEqual(["cmt_9"]);
  });

  it("marks a removal locally rather than deleting the row", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1", isOwn: true })] },
    });
    const next = threadReducer(loaded, { kind: "removed", id: "r1", by: author });
    expect(next.comments[0]?.status).toBe("removed");
    expect(next.comments[0]?.body).toBeNull();
    expect(next.comments[0]?.removedBy).toEqual(author);
  });

  it("toggles a reaction on and back off", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const on = threadReducer(loaded, {
      kind: "reacted", id: "r1", emoji: "👍", on: true,
    });
    expect(on.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);

    const off = threadReducer(on, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([]);
  });

  it("does not double-count a reader reacting twice without an intervening toggle off", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const once = threadReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: true });
    const twice = threadReducer(once, { kind: "reacted", id: "r1", emoji: "👍", on: true });
    expect(twice.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);
  });

  it("does not go negative un-reacting twice without an intervening toggle on", () => {
    const seeded = comment({
      id: "r1",
      reactions: [{ emoji: "👍", count: 1, reacted: true }],
    });
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [seeded] },
    });
    const once = threadReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    const twice = threadReducer(once, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(twice.comments[0]?.reactions).toEqual([]);
  });

  it("keeps other people's reaction count when the reader removes their own", () => {
    const seeded = comment({
      id: "r1",
      reactions: [{ emoji: "👍", count: 2, reacted: true }],
    });
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [seeded] },
    });
    const off = threadReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }]);
  });

  it("restores a snapshot on rollback", () => {
    const seeded = [comment({ id: "r1" })];
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: seeded },
    });
    const optimistic = threadReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1" }),
    });
    const rolled = threadReducer(optimistic, { kind: "restored", comments: seeded });
    expect(rolled.comments.map((c) => c.id)).toEqual(["r1"]);
  });

  it("records a failure without discarding what is already on screen", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const failed = threadReducer(loaded, { kind: "failed", message: "offline" });
    expect(failed.error).toBe("offline");
    expect(failed.comments).toHaveLength(1);
    // A failed mutation on an already-ready thread must not knock it back to
    // "error" — the thread stays on screen, just with an error message set.
    expect(failed.status).toBe("ready");
  });

  it("moves to error status when the initial load itself fails", () => {
    const failed = threadReducer(initialThreadState, { kind: "failed", message: "offline" });
    expect(failed.status).toBe("error");
  });
});
