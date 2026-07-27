import { describe, it, expect } from 'vitest';
import { authorize } from './authz.js';
import type { McpPrincipal } from './authz.js';

const owner: McpPrincipal = {
  orgUserId: 's1',
  orgId: 'o1',
  role: 'owner',
  scopes: ['lms:read', 'lms:write'],
};

const instructor: McpPrincipal = {
  orgUserId: 's2',
  orgId: 'o1',
  role: 'instructor',
  scopes: ['lms:read', 'lms:write'],
};

describe('authorize', () => {
  it('returns false when the principal lacks the required scope', () => {
    expect(authorize(owner, 'lms:admin', 'manage_billing')).toBe(false);
  });

  it('returns false for owner with wrong scope even for org-global permission', () => {
    expect(authorize(owner, 'missing_scope', 'manage_org_settings')).toBe(false);
  });

  it('returns true for owner with scope and org-global permission', () => {
    expect(authorize(owner, 'lms:write', 'manage_billing')).toBe(true);
  });

  it('returns true for owner with scope and view_student_progress', () => {
    expect(authorize(owner, 'lms:read', 'view_student_progress')).toBe(true);
  });

  it('returns false for instructor lacking the permission entirely', () => {
    expect(authorize(instructor, 'lms:write', 'manage_billing')).toBe(false);
  });

  it('returns false for instructor without the required scope', () => {
    expect(authorize(instructor, 'lms:admin', 'edit_assigned_course')).toBe(false);
  });

  it("denies a granted-but-narrowed ('assigned') capability", () => {
    // instructor.edit_assigned_course is "assigned", not true. Nothing narrows
    // it to a course subset, so authorize refuses rather than granting broadly.
    expect(authorize(instructor, 'lms:write', 'edit_assigned_course')).toBe(false);
    expect(authorize(instructor, 'lms:read', 'view_student_progress')).toBe(false);
  });
});
