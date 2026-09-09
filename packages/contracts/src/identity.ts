/**
 * Service-to-service response for resolving a verified Identity user by an
 * email address or normalized username. The endpoint never returns secrets.
 */
export interface IdentityUserResolution {
  id: string;
  email: string;
  username: string | null;
}

export interface IdentityIdentifierLookup {
  identifier: string;
}
