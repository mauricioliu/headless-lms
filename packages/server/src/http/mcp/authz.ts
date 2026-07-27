// MCP authorization: a tool call is allowed only if the token carries the
// required scope AND the user's role permits the action unconditionally.
// A capability that is granted-but-narrowed ("assigned") is denied here —
// nothing narrows it, so there is no subset to check against.
import { capability } from '../../core/organizations/index.js';
import type { Role, Permission } from '../../core/organizations/index.js';

export interface McpPrincipal {
  orgUserId: string;
  orgId: string;
  role: Role;
  scopes: readonly string[];
}

export function authorize(
  principal: McpPrincipal,
  scope: string,
  permission: Permission,
): boolean {
  if (!principal.scopes.includes(scope)) {
    return false;
  }
  return capability(principal.role, permission) === true;
}
