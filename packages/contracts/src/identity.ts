/**
 * Service-to-service response for resolving a verified Identity user by an
 * email address or normalized username. The endpoint never returns secrets.
 */
export interface IdentityUserResolution {
  id: string;
  displayName: string;
  email: string;
  username: string | null;
}

/** Minimal presentation identity returned by the authenticated internal batch lookup. */
export interface IdentityUserSummary {
  id: string;
  displayName: string;
  email: string;
}

export interface IdentityUsersResolutionRequest {
  ids: string[];
}

export interface IdentityIdentifierLookup {
  identifier: string;
}
