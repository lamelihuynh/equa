export class LedgerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class SocialUnavailableError extends Error {
  constructor(message = 'Social membership service is unavailable.') {
    super(message);
    this.name = 'SocialUnavailableError';
  }
}
