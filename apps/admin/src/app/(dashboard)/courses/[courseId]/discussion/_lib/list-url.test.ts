import { describe, expect, it } from "vitest";

import { listHref, nest } from "./list-url";
import type { CommentListItem } from "@/lib/api/types";

const PATH = "/courses/c1/discussion";

function row(id: string, parentId: string | null = null): CommentListItem {
  return { id, parentId } as CommentListItem;
}

describe("listHref", () => {
  it("is the bare path when nothing is set", () => {
    expect(listHref(PATH, {}, {})).toBe(PATH);
  });

  it("sets a new param", () => {
    expect(listHref(PATH, {}, { f_status: "pending" })).toBe(`${PATH}?f_status=pending`);
  });

  it("drops a param on null", () => {
    expect(listHref(PATH, { f_status: "pending" }, { f_status: null })).toBe(PATH);
  });

  it("carries unrelated params through", () => {
    const href = listHref(PATH, { sort: "-createdAt", q: "hi" }, { f_status: "removed" });
    expect(href).toContain("sort=-createdAt");
    expect(href).toContain("q=hi");
    expect(href).toContain("f_status=removed");
  });

  it("resets to page 1 when a filter changes", () => {
    expect(listHref(PATH, { page: "4" }, { f_status: "pending" })).toBe(`${PATH}?f_status=pending`);
  });

  it("keeps the page when page is what changed", () => {
    expect(listHref(PATH, { page: "4" }, { page: "5" })).toBe(`${PATH}?page=5`);
  });

  it("replaces rather than appends a repeated key", () => {
    expect(listHref(PATH, { f_status: ["a", "b"] }, { f_status: "c" })).toBe(`${PATH}?f_status=c`);
  });
});

describe("nest", () => {
  it("nests a reply under a parent on the same page", () => {
    const nodes = nest([row("a"), row("b", "a")]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].comment.id).toBe("a");
    expect(nodes[0].replies.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps an orphan reply as its own row", () => {
    const nodes = nest([row("b", "missing")]);
    expect(nodes.map((n) => n.comment.id)).toEqual(["b"]);
    expect(nodes[0].replies).toEqual([]);
  });

  it("groups several replies under one parent, in order", () => {
    const nodes = nest([row("a"), row("b", "a"), row("c", "a")]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].replies.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("preserves top-level source order", () => {
    const nodes = nest([row("a"), row("b"), row("c", "a")]);
    expect(nodes.map((n) => n.comment.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for no rows", () => {
    expect(nest([])).toEqual([]);
  });
});
