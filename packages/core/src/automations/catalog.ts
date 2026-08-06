// automations context — the code-owned catalogs `availableActions()` and
// `availableTriggers()` serve: built-in action definitions and the domain
// event types automations may react to.
import type { EmailTemplateId } from '@headless-lms/types';
import { assetEvents } from '../assets/index.js';
import { contentEvents } from '../content/index.js';
import { discussionEvents } from '../discussion/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import { identityEvents } from '../identity/index.js';
import { integrationEvents } from '../integrations/index.js';
import { organizationEvents } from '../organizations/index.js';
import { progressEvents } from '../progress/index.js';
import type { AvailableActions, AvailableTriggers } from './types.js';

/** Every EmailTemplateId — a missing key here is a compile error, kept exhaustive by construction. */
export const ALL_EMAIL_TEMPLATE_IDS: Record<EmailTemplateId, true> = {
  magicLink: true,
  studentInvite: true,
  memberInvite: true,
  passwordReset: true,
  emailVerification: true,
  accessGranted: true,
  accessRevoked: true,
  courseCompleted: true,
};

export function catalogActions(): AvailableActions {
  return [
    {
      type: 'sendEmail',
      description: 'Send a transactional email using a built-in template.',
      inputSchema: {
        type: 'object',
        required: ['template'],
        properties: {
          template: { enum: Object.keys(ALL_EMAIL_TEMPLATE_IDS) },
        },
      },
      source: 'system',
    },
  ];
}

export function catalogTriggers(): AvailableTriggers['triggers'] {
  return [
    { type: identityEvents.userCreated.type, description: 'a user was created' },
    { type: identityEvents.userUpdated.type, description: 'a user was updated' },
    { type: organizationEvents.organizationCreated.type, description: 'an organization was created' },
    { type: organizationEvents.organizationUpdated.type, description: 'an organization was updated' },
    { type: organizationEvents.organizationDeleted.type, description: 'an organization was deleted' },
    { type: organizationEvents.orgUserLinked.type, description: 'a user was linked to an organization' },
    { type: organizationEvents.orgUserDeleted.type, description: 'a user was removed from an organization' },
    { type: organizationEvents.inviteCreated.type, description: 'an invite was created or re-issued' },
    { type: organizationEvents.inviteAccepted.type, description: 'an invite was accepted' },
    { type: organizationEvents.studentCreated.type, description: 'a student was created' },
    { type: organizationEvents.studentDeleted.type, description: 'a student was deleted' },
    { type: organizationEvents.studentLinked.type, description: 'a pending student was linked to an auth account' },
    { type: contentEvents.courseCreated.type, description: 'a course was created' },
    { type: contentEvents.courseUpdated.type, description: 'a course was updated' },
    { type: contentEvents.courseDeleted.type, description: 'a course was deleted' },
    { type: contentEvents.moduleCreated.type, description: 'a course module was created' },
    { type: contentEvents.moduleUpdated.type, description: 'a course module was updated' },
    { type: contentEvents.moduleDeleted.type, description: 'a course module was deleted' },
    { type: contentEvents.modulesReordered.type, description: 'course modules were reordered' },
    { type: contentEvents.activityCreated.type, description: 'a course activity was created' },
    { type: contentEvents.activityUpdated.type, description: 'a course activity was updated' },
    { type: contentEvents.activityDeleted.type, description: 'a course activity was deleted' },
    { type: contentEvents.activitiesReordered.type, description: 'course activities were reordered' },
    { type: contentEvents.downloadCreated.type, description: 'a download was created' },
    { type: contentEvents.downloadUpdated.type, description: 'a download was updated' },
    { type: contentEvents.downloadDeleted.type, description: 'a download was deleted' },
    { type: contentEvents.downloadAssetAdded.type, description: 'a download asset was added' },
    { type: contentEvents.downloadAssetRemoved.type, description: 'a download asset was removed' },
    { type: contentEvents.downloadAssetRenamed.type, description: 'a download asset was renamed' },
    { type: contentEvents.downloadAssetsReordered.type, description: 'download assets were reordered' },
    { type: entitlementEvents.entitlementCreated.type, description: 'a student was granted access to content' },
    { type: entitlementEvents.entitlementUpdated.type, description: "an entitlement's status or expiry changed" },
    { type: entitlementEvents.entitlementDeleted.type, description: "a student's access to content was revoked" },
    { type: entitlementEvents.entitlementExpired.type, description: 'an entitlement passed its expiry' },
    { type: progressEvents.progressStarted.type, description: 'a student started a progress record' },
    { type: progressEvents.progressCompleted.type, description: 'a student completed a progress record' },
    { type: integrationEvents.connectionCreated.type, description: 'an integration connection was established' },
    { type: integrationEvents.connectionUpdated.type, description: "an integration connection changed" },
    { type: integrationEvents.connectionRemoved.type, description: 'an integration connection was removed' },
    { type: discussionEvents.commentCreated.type, description: 'a comment was created' },
    { type: discussionEvents.commentPublished.type, description: 'a comment was published' },
    { type: discussionEvents.commentRemoved.type, description: 'a comment was removed' },
    { type: discussionEvents.commentReported.type, description: 'a comment was reported' },
    { type: assetEvents.assetCreated.type, description: 'an asset upload was requested' },
    { type: assetEvents.assetReady.type, description: 'an asset was confirmed ready' },
    { type: assetEvents.assetDeleted.type, description: 'an asset was deleted' },
  ];
}
