import 'fastify';
import type { UserProfile } from '@headless-lms/types';

// The authenticated person attached to a request by `requireOrgSession`. `id` is
// the auth engine's user id, not org_users.id — see UserProfile.
export interface AuthUser extends UserProfile {
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Session guard. Populates `authUser`/`orgId`, or throws `UnauthorizedError`. */
    requireOrgSession(request: FastifyRequest): Promise<void>;
  }
  interface FastifyRequest {
    authUser: AuthUser;
    /** Active organization id from the session, set by `requireOrgSession`. */
    orgId: string;
  }
}
