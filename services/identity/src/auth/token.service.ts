import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

import { IdentityConfigService } from '../config/identity-config.service';

export interface AccessClaims {
  sub: string;
  roles: string[];
  email: string;
}

@Injectable()
export class TokenService {
  constructor(@Inject(IdentityConfigService) private readonly config: IdentityConfigService) {}

  createOpaqueToken(): string {
    return randomBytes(48).toString('base64url');
  }
  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  createId(): string {
    return randomUUID();
  }

  async signAccessToken(claims: AccessClaims): Promise<string> {
    return new SignJWT({ roles: claims.roles, email: claims.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenMinutes}m`)
      .sign(this.config.jwtSecret);
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.config.jwtSecret, {
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
    });
    return {
      sub: payload.sub ?? '',
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === 'string')
        : [],
      email: typeof payload.email === 'string' ? payload.email : '',
    };
  }
}
