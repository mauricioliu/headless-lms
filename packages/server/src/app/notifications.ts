// Email side-effects of domain events, subscribed on the EventBus. Events
// reach the bus via the outbox relay at-least-once: a mailer failure throws
// through publish, and the relay retries with backoff — no email is silently
// dropped.
import type { EventBus } from '../core/shared/ports.js';
import type { Mailer, MailerLookups } from '../core/shared/mailer.js';
import { entitlementEvents } from '../core/entitlements/index.js';

export function registerNotificationSubscribers(
  bus: EventBus,
  mailer: Pick<Mailer, 'send'>,
  lookups: MailerLookups,
): void {
  bus.subscribe(entitlementEvents.entitlementCreated, async (event) => {
    const { orgUserId, contentId } = event.data;
    const [to, content] = await Promise.all([
      lookups.orgUserEmail(event.orgId, orgUserId),
      lookups.contentInfo(event.orgId, contentId),
    ]);
    if (!to || !content) {
      throw new Error(`entitlement notification lookups failed: ${event.data.id}`);
    }
    await mailer.send(to, 'accessGranted', {
      contentTitle: content.title,
      contentId: content.id,
    });
  });

  bus.subscribe(entitlementEvents.entitlementDeleted, async (event) => {
    const { orgUserId, contentId } = event.data;
    const [to, content] = await Promise.all([
      lookups.orgUserEmail(event.orgId, orgUserId),
      lookups.contentInfo(event.orgId, contentId),
    ]);
    if (!to || !content) {
      throw new Error(`entitlement notification lookups failed: ${event.data.id}`);
    }
    await mailer.send(to, 'accessRevoked', {
      contentTitle: content.title,
    });
  });
}
