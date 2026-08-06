// Email side-effects of domain events, subscribed on the EventBus. Events
// reach the bus via the outbox relay at-least-once: a mailer failure throws
// through publish, and the relay retries with backoff — no email is silently
// dropped.
import type { EventBus } from '../core/shared/ports.js';
import type { Mailer } from '@headless-lms/server';
import { entitlementEvents } from '../core/entitlements/index.js';

export function registerNotificationSubscribers(bus: EventBus, mailer: Pick<Mailer, 'send'>): void {
  bus.subscribe(entitlementEvents.entitlementCreated, async (event) => {
    const entitlement = event.data;
    await mailer.send(entitlement.email, 'accessGranted', {
      contentTitle: entitlement.content.title,
      contentId: entitlement.content.id,
    });
  });

  bus.subscribe(entitlementEvents.entitlementDeleted, async (event) => {
    const entitlement = event.data;
    await mailer.send(entitlement.email, 'accessRevoked', {
      contentTitle: entitlement.content.title,
    });
  });
}
