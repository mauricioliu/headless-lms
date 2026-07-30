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
    /** Active organization id from the session; guaranteed set by
     *  `requireOrgSession`, absent under `requireSession` when there is none. */
    orgId: string;
  }
}
