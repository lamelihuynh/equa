import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityConfigService {
  get databaseUrl(): string {
    return this.required('IDENTITY_DATABASE_URL');
  }

  get jwtSecret(): Uint8Array {
    return new TextEncoder().encode(this.required('IDENTITY_JWT_SECRET'));
  }

  get jwtIssuer(): string {
    return process.env.IDENTITY_JWT_ISSUER ?? 'equa-identity';
  }

  get jwtAudience(): string {
    return process.env.IDENTITY_JWT_AUDIENCE ?? 'equa-clients';
  }

  get serviceKey(): string | undefined {
    return process.env.IDENTITY_SERVICE_KEY ?? process.env.SOCIAL_SERVICE_KEY;
  }

  get accessTokenMinutes(): number {
    return Number(process.env.IDENTITY_ACCESS_TOKEN_MINUTES ?? 15);
  }

  get refreshTokenDays(): number {
    return Number(process.env.IDENTITY_REFRESH_TOKEN_DAYS ?? 30);
  }

  get appWebUrl(): string {
    return process.env.APP_WEB_URL ?? 'http://localhost:3000';
  }

  get emailProvider(): 'mailpit' | 'resend' {
    return process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'mailpit';
  }

  get emailFrom(): string {
    return process.env.EMAIL_FROM ?? 'Equa <no-reply@localhost>';
  }

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  get s3Endpoint(): string {
    return process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  }
  get s3Region(): string {
    return process.env.S3_REGION ?? 'us-east-1';
  }
  get s3AccessKey(): string {
    return this.required('S3_ACCESS_KEY');
  }
  get s3SecretKey(): string {
    return this.required('S3_SECRET_KEY');
  }
  get avatarBucket(): string {
    return process.env.S3_AVATAR_BUCKET ?? 'equa-avatars';
  }

  private required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be configured.`);
    return value;
  }
}
