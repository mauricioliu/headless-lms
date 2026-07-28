import { describe, it, expect } from "vitest";
import type { CommentView, CommentsConfig } from "@/lib/api/types";
import {
  groupComments,
  initialCommentsState,
  permissions,
  commentsReducer,
} from "./comment-state";

const author = { id: "orm_a", name: "Ana Diaz", image: null, role: "student" as const };
const instructor = { id: "orm_s", name: "Sarah Chen", image: null, role: "instructor" as const };

function comment(over: Partial<CommentView> = {}): CommentView {
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

const open: CommentsConfig = {
  enabled: true,
  threaded: true,
  requireReview: false,
  reactions: true,
  state: "visible",
};

describe("groupComments", () => {
  it("nests replies under their root, one level deep", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1" });
    const nodes = groupComments([root, reply]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.comment.id).toBe("r1");
    expect(nodes[0]?.replies.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps a removed root that still has a visible reply", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    const reply = comment({ id: "p1", parentId: "r1" });
    expect(groupComments([root, reply])).toHaveLength(1);
  });

  it("drops a removed root with no visible replies", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    expect(groupComments([root])).toHaveLength(0);
  });

  it("never renders a removed reply", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1", status: "removed", body: null });
    expect(groupComments([root, reply])[0]?.replies).toHaveLength(0);
  });

  it("drops a reply whose root is gone", () => {
    expect(groupComments([comment({ id: "p1", parentId: "missing" })])).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("offers reply, react, edit and remove when comments are open", () => {
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

  it("keeps reporting available on locked comments and nothing else", () => {
    const locked = { ...open, state: "locked" as const };
    const p = permissions(locked, comment());
    expect(p.canReport).toBe(true);
    expect(p.canReply).toBe(false);
    expect(p.canReact).toBe(false);
    expect(permissions(locked, comment({ isOwn: true })).canEdit).toBe(false);
  });

  it("lets an author still remove their own comment when comments are locked", () => {
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

describe("commentsReducer", () => {
  it("marks comments off when the course has discussion disabled", () => {
    const next = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("marks comments off when the activity hides them", () => {
    const next = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: { ...open, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("marks comments off when the course disables discussion even while the activity still shows it visible", () => {
    const next = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false, state: "visible" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("appends an inserted comment and replaces it once the server answers", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [] },
    });
    const optimistic = commentsReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1", isOwn: true }),
    });
    expect(optimistic.comments.map((c) => c.id)).toEqual(["temp_1"]);

    const confirmed = commentsReducer(optimistic, {
      kind: "replaced",
      id: "temp_1",
      comment: comment({ id: "cmt_9", isOwn: true }),
    });
    expect(confirmed.comments.map((c) => c.id)).toEqual(["cmt_9"]);
  });

  it("marks a removal locally rather than deleting the row", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1", isOwn: true })] },
    });
    const next = commentsReducer(loaded, { kind: "removed", id: "r1", by: author });
    expect(next.comments[0]?.status).toBe("removed");
    expect(next.comments[0]?.body).toBeNull();
    expect(next.comments[0]?.removedBy).toEqual(author);
  });

  it("toggles a reaction on and back off", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const on = commentsReducer(loaded, {
      kind: "reacted", id: "r1", emoji: "👍", on: true,
    });
    expect(on.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);

    const off = commentsReducer(on, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([]);
  });

  it("does not double-count a reader reacting twice without an intervening toggle off", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const once = commentsReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: true });
    const twice = commentsReducer(once, { kind: "reacted", id: "r1", emoji: "👍", on: true });
    expect(twice.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);
  });

  it("does not go negative un-reacting twice without an intervening toggle on", () => {
    const seeded = comment({
      id: "r1",
      reactions: [{ emoji: "👍", count: 1, reacted: true }],
    });
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [seeded] },
    });
    const once = commentsReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    const twice = commentsReducer(once, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(twice.comments[0]?.reactions).toEqual([]);
  });

  it("keeps other people's reaction count when the reader removes their own", () => {
    const seeded = comment({
      id: "r1",
      reactions: [{ emoji: "👍", count: 2, reacted: true }],
    });
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [seeded] },
    });
    const off = commentsReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }]);
  });

  it("restores a snapshot on rollback", () => {
    const seeded = [comment({ id: "r1" })];
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: seeded },
    });
    const optimistic = commentsReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1" }),
    });
    const rolled = commentsReducer(optimistic, { kind: "restored", comments: seeded });
    expect(rolled.comments.map((c) => c.id)).toEqual(["r1"]);
  });

  it("records a failure without discarding what is already on screen", () => {
    const loaded = commentsReducer(initialCommentsState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const failed = commentsReducer(loaded, { kind: "failed", message: "offline" });
    expect(failed.error).toBe("offline");
    expect(failed.comments).toHaveLength(1);
    // A failed mutation on already-ready comments must not knock them back to
    // "error" — comments stay on screen, just with an error message set.
    expect(failed.status).toBe("ready");
  });

  it("moves to error status when the initial load itself fails", () => {
    const failed = commentsReducer(initialCommentsState, { kind: "failed", message: "offline" });
    expect(failed.status).toBe("error");
  });
});
