import 'fastify';
import type { UserProfile } from '@headless-lms/types';

// The authenticated person attached to a request by `requireSession`. `id` is
// the auth engine's user id, not org_users.id — see UserProfile.
export interface AuthUser extends UserProfile {
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
    /** Active organization id from the session, set by `requireSession`. */
    orgId?: string | null;
  }
}
