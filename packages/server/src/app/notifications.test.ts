import { describe, it, expect, vi } from 'vitest';
import { registerNotificationSubscribers } from './notifications.js';
import { InMemoryEventBus } from '../adapters/events/index.js';
import type { Entitlement } from '@headless-lms/types';
import { entitlementEvents } from '../core/entitlements/index.js';

const ENTITLEMENT: Entitlement = {
  id: 'e1',
  orgUserId: 's1',
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob@example.com',
  content: { id: 'c1', type: 'course', title: 'Intro' },
  status: 'active',
  grantedAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  source: 'manual',
};

const meta = { id: 'ev1', occurredAt: '2026-01-01T00:00:00Z' };
const created = {
  ...entitlementEvents.entitlementCreated.make({
    orgId: 'org-1',
    subject: ENTITLEMENT.id,
    data: ENTITLEMENT,
  }),
  ...meta,
};
const deleted = {
  ...entitlementEvents.entitlementDeleted.make({
    orgId: 'org-1',
    subject: ENTITLEMENT.id,
    data: ENTITLEMENT,
  }),
  ...meta,
};
const updated = {
  ...entitlementEvents.entitlementUpdated.make({
    orgId: 'org-1',
    subject: ENTITLEMENT.id,
    data: ENTITLEMENT,
  }),
  ...meta,
};

function build() {
  const bus = new InMemoryEventBus();
  const send = vi.fn().mockResolvedValue(undefined);
  registerNotificationSubscribers(bus, { send });
  return { bus, send };
}

describe('notification subscribers', () => {
  it('sends accessGranted on entitlement.created', async () => {
    const { bus, send } = build();
    await bus.publish(created);
    expect(send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentId: 'c1',
    });
  });

  it('sends accessRevoked on entitlement.deleted', async () => {
    const { bus, send } = build();
    await bus.publish(deleted);
    expect(send).toHaveBeenCalledWith('bob@example.com', 'accessRevoked', {
      contentTitle: 'Intro',
    });
  });

  it('sends nothing on entitlement.updated (reactivation)', async () => {
    const { bus, send } = build();
    await bus.publish(updated);
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates a mailer failure so the relay retries the dispatch', async () => {
    const { bus, send } = build();
    send.mockRejectedValue(new Error('smtp down'));
    await expect(
      bus.publish(created),
    ).rejects.toThrow('smtp down');
  });
});
