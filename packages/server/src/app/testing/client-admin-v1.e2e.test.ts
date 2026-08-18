import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
import type { TestApp } from './test-app.js';
import { buildTestApp } from './test-app.js';

let harness: TestApp;

beforeAll(async () => {
  harness = await buildTestApp();
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('v1 automation engine', () => {
  it('uses the Inline container default', () => {
    expect(harness.container.automationEngine).toBeInstanceOf(InlineAutomationEngine);
  });
});
