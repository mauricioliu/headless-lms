import { assetSchema } from '@headless-lms/types/schemas';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

export const assetEvents = {
  assetCreated: defineEvent({
    type: 'asset.created',
    version: 1,
    data: assetSchema,
  }),
  assetReady: defineEvent({
    type: 'asset.ready',
    version: 1,
    data: assetSchema,
  }),
  assetDeleted: defineEvent({
    type: 'asset.deleted',
    version: 1,
    data: assetSchema,
  }),
};

export type AssetCreated = EventOf<typeof assetEvents.assetCreated>;
export type AssetReady = EventOf<typeof assetEvents.assetReady>;
export type AssetDeleted = EventOf<typeof assetEvents.assetDeleted>;
export type AssetEvent = EventOfValues<typeof assetEvents>;
