import { connectionSchema } from '@headless-lms/types/schemas';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

export const integrationEvents = {
  connectionCreated: defineEvent({
    type: 'integration.connection.created',
    version: 1,
    data: connectionSchema,
  }),
  connectionUpdated: defineEvent({
    type: 'integration.connection.updated',
    version: 1,
    data: connectionSchema,
  }),
  connectionRemoved: defineEvent({
    type: 'integration.connection.removed',
    version: 1,
    data: connectionSchema,
  }),
};

export type ConnectionCreated = EventOf<typeof integrationEvents.connectionCreated>;
export type ConnectionUpdated = EventOf<typeof integrationEvents.connectionUpdated>;
export type ConnectionRemoved = EventOf<typeof integrationEvents.connectionRemoved>;
export type IntegrationEvent = EventOfValues<typeof integrationEvents>;
