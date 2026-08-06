// Domain-owned invite tokens: an unguessable secret in the emailed link, only
// its sha256 at rest. Same core-utility status as id.ts (one implementation,
// nothing to swap).
import { createHash, randomBytes } from 'node:crypto';

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
