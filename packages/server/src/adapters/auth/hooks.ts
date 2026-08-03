// Callbacks the auth adapter invokes when Better Auth reports something
// happened. Every payload here is already in domain vocabulary — the adapter
// translates Better Auth's models before calling, so no Better Auth type
// crosses this boundary. The adapter decides nothing: it reports, and applies
// whatever comes back.
export interface AuthHooks {
  /** Password-reset email for an existing account. */
  sendPasswordReset(params: { email: string; url: string }): Promise<void>;
  /** Sign-in link email. Sign-up is disabled, so the address always exists. */
  sendMagicLink(params: { email: string; url: string }): Promise<void>;
  /** An account was created. `externalId` is its id in the auth engine. */
  userCreated(params: {
    externalId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<void>;
  organizationUpdated(params: { externalId: string; name: string; slug: string }): Promise<void>;
  organizationDeleted(params: { externalId: string }): Promise<void>;
  orgUserAdded(params: {
    orgExternalId: string;
    userExternalId: string;
    role: string;
  }): Promise<void>;
  orgUserRemoved(params: { orgExternalId: string; userExternalId: string }): Promise<void>;
  /** External id of the org a session being created should start in; null to leave it unset. */
  activeOrgForNewSession(params: { userExternalId: string }): Promise<string | null>;
  /** Whether the OAuth consent flow must interrupt and ask this person to pick an org. */
  needsOrgChoice(params: { userExternalId: string }): Promise<boolean>;
}
