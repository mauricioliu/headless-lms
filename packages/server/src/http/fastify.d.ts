import 'fastify';
import type { UserProfile } from '@headless-lms/types';

// The authenticated person attached to a request by the session guards. `id` is
// the auth engine's user id, not org_users.id — see UserProfile.
export interface AuthUser extends UserProfile {
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Session guard. Populates `authUser` (and `orgId` when the session has an
     *  active org), or throws `UnauthorizedError`. Use for the routes reached
     *  before the caller has an org — org creation, invite acceptance. */
    requireSession(request: FastifyRequest): Promise<void>;
    /** As `requireSession`, but also requires an active org on the session. */
    requireOrgSession(request: FastifyRequest): Promise<void>;
  }
  interface FastifyRequest {
    authUser: AuthUser;
    /** Domain `organizations.id` for the session's active org — what every
     *  domain read keys off. Guaranteed set by `requireOrgSession`; absent under
     *  `requireSession` when the session has no active org. */
    orgId: string;
    /** The same org as better-auth knows it (`organizations.external_id`), for
     *  writes that go back through the auth provider. */
    authOrgId: string;
    /** Domain `users.id` for the session's account — what `org_users.user_id`
     *  and every other domain row references. Not `authUser.id`: the two match
     *  only for a self-signup, never for a person an admin provisioned first. */
    userId: string;
  }
}
