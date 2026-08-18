import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
import type { TestApp } from './test-app.js';
import { buildTestApp } from './test-app.js';

// Ticket #18: nothing in the v1 pilot runs through the automation engine.
// The container starts with no engine override (Inline is the default), and
// the v1 Client Admin surface exposes no route that could create, update, or
// delete an automation — only reads stay mounted, so the Automations feature
// remains intact (and auditable) while activation is impossible.
let harness: TestApp;

beforeAll(async () => {
  harness = await buildTestApp();
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('v1 Client Admin automation surface', () => {
  it('starts the container with no engine override — Inline is the default', () => {
    expect(harness.container.automationEngine).toBeInstanceOf(InlineAutomationEngine);
  });

  it('mounts no route that creates, updates, or deletes automations', () => {
    expect(
      harness.app.hasRoute({ method: 'POST', url: '/api/automations' }),
    ).toBe(false);
    expect(
      harness.app.hasRoute({ method: 'PATCH', url: '/api/automations/:id' }),
    ).toBe(false);
    expect(
      harness.app.hasRoute({ method: 'DELETE', url: '/api/automations/:id' }),
    ).toBe(false);
  });

  it('keeps the Automations feature intact — reads stay mounted', () => {
    expect(harness.app.hasRoute({ method: 'GET', url: '/api/automations' })).toBe(true);
    expect(
      harness.app.hasRoute({ method: 'GET', url: '/api/automations/:id/runs' }),
    ).toBe(true);
  });
});
