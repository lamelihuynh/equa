import { ApiException } from '../common/api.exception';
import { HttpStatus } from '@nestjs/common';

export function assertPasswordPolicy(password: string): void {
  if (
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new ApiException(
      'AUTH_PASSWORD_POLICY_FAILED',
      'Password must have at least 8 characters including upper-case, lower-case, and a number.',
      HttpStatus.BAD_REQUEST,
    );
  }
}
