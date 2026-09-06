import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api.exception';
import { IdentityConfigService } from '../config/identity-config.service';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../email/email.service';
import { assertPasswordPolicy } from './password-policy';
import { TokenService } from './token.service';
import type { AuthTokens, RequestMetadata } from './auth.types';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: string;
  roles: string[];
  display_name: string;
  avatar_key: string | null;
  default_currency: string;
  locale: string;
  timezone: string;
  bio: string;
}
export interface ProfileResponse {
  id: string;
  email: string;
  displayName: string;
  avatarKey: string | null;
  bio: string;
  defaultCurrency: string;
  locale: string;
  timezone: string;
  roles: string[];
}
interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IdentityConfigService) private readonly config: IdentityConfigService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async register(
    input: { email: string; password: string; displayName: string },
    metadata: RequestMetadata,
  ): Promise<{ userId: string; verificationSent: true }> {
    assertPasswordPolicy(input.password);
    const email = input.email.trim().toLowerCase();
    const existing = await this.database.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    if (existing.rowCount)
      throw new ApiException(
        'AUTH_EMAIL_ALREADY_EXISTS',
        'An account already exists for this email.',
        HttpStatus.CONFLICT,
      );
    const userId = this.tokenService.createId();
    const verificationToken = this.tokenService.createOpaqueToken();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.database.query(
      'INSERT INTO users (id,email,password_hash,status) VALUES ($1,$2,$3,$4)',
      [userId, email, passwordHash, 'UNVERIFIED'],
    );
    await this.database.query('INSERT INTO user_profiles (user_id,display_name) VALUES ($1,$2)', [
      userId,
      input.displayName.trim(),
    ]);
    await this.storeVerificationToken(userId, verificationToken);
    await this.email.sendVerification(email, verificationToken);
    await this.audit.record({
      actorUserId: userId,
      action: 'AUTH_REGISTER',
      resourceType: 'user',
      resourceId: userId,
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    return { userId, verificationSent: true };
  }

  async verifyEmail(token: string, metadata: RequestMetadata): Promise<{ verified: true }> {
    const userId = await this.consumeOneTimeToken('email_verification_tokens', token);
    await this.database.query(
      "UPDATE users SET status = 'ACTIVE', updated_at = now() WHERE id = $1",
      [userId],
    );
    await this.audit.record({
      actorUserId: userId,
      action: 'AUTH_EMAIL_VERIFIED',
      resourceType: 'user',
      resourceId: userId,
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
    });
    return { verified: true };
  }

  async resendVerification(
    emailInput: string,
    metadata: RequestMetadata,
  ): Promise<{ accepted: true }> {
    const email = emailInput.trim().toLowerCase();
    const result = await this.database.query<Pick<UserRow, 'id' | 'status'>>(
      'SELECT id,status FROM users WHERE email = $1',
      [email],
    );
    const user = result.rows[0];
    if (user?.status === 'UNVERIFIED') {
      const token = this.tokenService.createOpaqueToken();
      await this.storeVerificationToken(user.id, token);
      await this.email.sendVerification(email, token);
      await this.audit.record({
        actorUserId: user.id,
        action: 'AUTH_VERIFICATION_RESENT',
        resourceType: 'user',
        resourceId: user.id,
        correlationId: metadata.correlationId,
        outcome: 'SUCCESS',
      });
    }
    return { accepted: true };
  }

  async login(
    input: { email: string; password: string },
    metadata: RequestMetadata,
  ): Promise<AuthTokens> {
    const result = await this.database.query<UserRow>(`${this.userSelect()} WHERE u.email = $1`, [
      input.email.trim().toLowerCase(),
    ]);
    const user = result.rows[0];
    if (!user || !(await argon2.verify(user.password_hash, input.password))) {
      await this.audit.record({
        action: 'AUTH_LOGIN',
        resourceType: 'user',
        correlationId: metadata.correlationId,
        outcome: 'FAILURE',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new ApiException(
        'AUTH_INVALID_CREDENTIALS',
        'Email or password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (user.status !== 'ACTIVE')
      throw new ApiException(
        'AUTH_EMAIL_NOT_VERIFIED',
        'Verify your email before signing in.',
        HttpStatus.FORBIDDEN,
      );
    const tokens = await this.createSessionTokens(user, metadata);
    await this.audit.record({
      actorUserId: user.id,
      action: 'AUTH_LOGIN',
      resourceType: 'session',
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    return tokens;
  }

  async refresh(refreshToken: string, metadata: RequestMetadata): Promise<AuthTokens> {
    const hash = this.tokenService.hashOpaqueToken(refreshToken);
    const result = await this.database.query<SessionRow>(
      'SELECT id,user_id,family_id,expires_at,used_at,revoked_at FROM refresh_sessions WHERE token_hash = $1',
      [hash],
    );
    const session = result.rows[0];
    if (!session)
      throw new ApiException(
        'AUTH_TOKEN_INVALID',
        'Refresh token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    if (session.used_at || session.revoked_at || session.expires_at <= new Date()) {
      await this.database.query(
        'UPDATE refresh_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        [session.family_id],
      );
      await this.audit.record({
        actorUserId: session.user_id,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        resourceType: 'session',
        resourceId: session.id,
        correlationId: metadata.correlationId,
        outcome: 'FAILURE',
      });
      throw new ApiException(
        'AUTH_REFRESH_TOKEN_REUSED',
        'Session was revoked for security.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.database.query(
      'UPDATE refresh_sessions SET used_at = now(), revoked_at = now() WHERE id = $1',
      [session.id],
    );
    const user = await this.userById(session.user_id);
    const tokens = await this.createSessionTokens(user, metadata, session.family_id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'AUTH_TOKEN_REFRESHED',
      resourceType: 'session',
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
    });
    return tokens;
  }

  async logout(
    refreshToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<{ loggedOut: true }> {
    if (refreshToken)
      await this.database.query(
        'UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [this.tokenService.hashOpaqueToken(refreshToken)],
      );
    await this.audit.record({
      action: 'AUTH_LOGOUT',
      resourceType: 'session',
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
    });
    return { loggedOut: true };
  }

  async logoutAll(userId: string, metadata: RequestMetadata): Promise<{ loggedOut: true }> {
    await this.database.query(
      'UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    await this.audit.record({
      actorUserId: userId,
      action: 'AUTH_LOGOUT_ALL',
      resourceType: 'session',
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
    });
    return { loggedOut: true };
  }

  async forgotPassword(emailInput: string, metadata: RequestMetadata): Promise<{ accepted: true }> {
    const email = emailInput.trim().toLowerCase();
    const found = await this.database.query<Pick<UserRow, 'id'>>(
      'SELECT id FROM users WHERE email = $1 AND status = $2',
      [email, 'ACTIVE'],
    );
    const user = found.rows[0];
    if (user) {
      const token = this.tokenService.createOpaqueToken();
      await this.storeResetToken(user.id, token);
      await this.email.sendPasswordReset(email, token);
      await this.audit.record({
        actorUserId: user.id,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        resourceType: 'user',
        resourceId: user.id,
        correlationId: metadata.correlationId,
        outcome: 'SUCCESS',
      });
    }
    return { accepted: true };
  }

  async resetPassword(
    token: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<{ reset: true }> {
    assertPasswordPolicy(password);
    const userId = await this.consumeOneTimeToken('password_reset_tokens', token);
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await this.database.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [hash, userId],
    );
    await this.database.query(
      'UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    await this.audit.record({
      actorUserId: userId,
      action: 'AUTH_PASSWORD_RESET',
      resourceType: 'user',
      resourceId: userId,
      correlationId: metadata.correlationId,
      outcome: 'SUCCESS',
    });
    return { reset: true };
  }

  async profile(userId: string): Promise<ProfileResponse> {
    return this.toProfile(await this.userById(userId));
  }

  async updateProfile(
    userId: string,
    input: {
      displayName?: string;
      defaultCurrency?: string;
      locale?: string;
      timezone?: string;
      avatarKey?: string;
      bio?: string;
    },
  ): Promise<ProfileResponse> {
    const current = await this.userById(userId);
    await this.database.query(
      `UPDATE user_profiles SET display_name=$1, default_currency=$2, locale=$3, timezone=$4, avatar_key=$5, bio=$6, updated_at=now() WHERE user_id=$7`,
      [
        input.displayName?.trim() ?? current.display_name,
        input.defaultCurrency ?? current.default_currency,
        input.locale ?? current.locale,
        input.timezone ?? current.timezone,
        input.avatarKey ?? current.avatar_key,
        input.bio?.trim() ?? current.bio,
        userId,
      ],
    );
    return this.toProfile(await this.userById(userId));
  }

  private async createSessionTokens(
    user: UserRow,
    metadata: RequestMetadata,
    familyId = this.tokenService.createId(),
  ): Promise<AuthTokens> {
    const refreshToken = this.tokenService.createOpaqueToken();
    const expires = new Date(Date.now() + this.config.refreshTokenDays * 86400_000);
    await this.database.query(
      'INSERT INTO refresh_sessions (id,user_id,family_id,token_hash,user_agent,ip_address,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        this.tokenService.createId(),
        user.id,
        familyId,
        this.tokenService.hashOpaqueToken(refreshToken),
        metadata.userAgent ?? null,
        metadata.ipAddress ?? null,
        expires,
      ],
    );
    return {
      accessToken: await this.tokenService.signAccessToken({
        sub: user.id,
        roles: user.roles,
        email: user.email,
      }),
      refreshToken,
      refreshExpiresAt: expires.toISOString(),
    };
  }

  private async storeVerificationToken(userId: string, token: string): Promise<void> {
    await this.database.query(
      'UPDATE email_verification_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    await this.database.query(
      "INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now() + interval '24 hours')",
      [this.tokenService.createId(), userId, this.tokenService.hashOpaqueToken(token)],
    );
  }

  private async storeResetToken(userId: string, token: string): Promise<void> {
    await this.database.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    await this.database.query(
      "INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now() + interval '20 minutes')",
      [this.tokenService.createId(), userId, this.tokenService.hashOpaqueToken(token)],
    );
  }

  private async consumeOneTimeToken(
    table: 'email_verification_tokens' | 'password_reset_tokens',
    token: string,
  ): Promise<string> {
    const result = await this.database.query<{ user_id: string }>(
      `UPDATE ${table} SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [this.tokenService.hashOpaqueToken(token)],
    );
    const item = result.rows[0];
    if (!item)
      throw new ApiException(
        'AUTH_TOKEN_EXPIRED',
        'Token is invalid or expired.',
        HttpStatus.BAD_REQUEST,
      );
    return item.user_id;
  }

  private async userById(userId: string): Promise<UserRow> {
    const result = await this.database.query<UserRow>(`${this.userSelect()} WHERE u.id = $1`, [
      userId,
    ]);
    const user = result.rows[0];
    if (!user)
      throw new ApiException('AUTH_TOKEN_INVALID', 'User is unavailable.', HttpStatus.UNAUTHORIZED);
    return user;
  }

  private userSelect(): string {
    return 'SELECT u.id,u.email,u.password_hash,u.status,u.roles,p.display_name,p.avatar_key,p.default_currency,p.locale,p.timezone,p.bio FROM users u JOIN user_profiles p ON p.user_id = u.id';
  }

  private toProfile(user: UserRow): ProfileResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarKey: user.avatar_key,
      bio: user.bio,
      defaultCurrency: user.default_currency,
      locale: user.locale,
      timezone: user.timezone,
      roles: user.roles,
    };
  }
}
