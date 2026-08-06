import { entitlementSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

export const entitlementEvents = {
  entitlementCreated: defineEvent({
    type: 'entitlement.created',
    version: 1,
    data: entitlementSchema,
  }),
  entitlementUpdated: defineEvent({
    type: 'entitlement.updated',
    version: 1,
    data: entitlementSchema,
  }),
  entitlementDeleted: defineEvent({
    type: 'entitlement.deleted',
    version: 1,
    data: entitlementSchema,
  }),
  entitlementExpired: defineEvent({
    type: 'entitlement.expired',
    version: 1,
    data: entitlementSchema,
  }),
};

export type EntitlementCreated = EventOf<typeof entitlementEvents.entitlementCreated>;
export type EntitlementUpdated = EventOf<typeof entitlementEvents.entitlementUpdated>;
export type EntitlementDeleted = EventOf<typeof entitlementEvents.entitlementDeleted>;
export type EntitlementExpired = EventOf<typeof entitlementEvents.entitlementExpired>;
export type EntitlementEvent = EventOfValues<typeof entitlementEvents>;
