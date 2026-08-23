import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { TokenService } from './token.service';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: { id: string; roles: string[]; email: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token.');
    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims.sub) throw new UnauthorizedException('Invalid access token.');
    request.user = { id: claims.sub, roles: claims.roles, email: claims.email };
    return true;
  }
}
