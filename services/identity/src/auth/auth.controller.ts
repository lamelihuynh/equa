import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from './auth.service';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import {
  EmailDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyTokenDto,
} from './auth.dto';
import type { RequestMetadata } from './auth.types';

@ApiTags('Authentication')
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register an account and send verification email' })
  @ApiBody({ type: RegisterDto })
  register(@Body() body: RegisterDto | undefined, @Req() request: FastifyRequest) {
    return this.auth.register(requireBody(body), metadata(request));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: VerifyTokenDto })
  verifyEmail(@Body() body: VerifyTokenDto, @Req() request: FastifyRequest) {
    return this.auth.verifyEmail(body.token, metadata(request));
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: EmailDto })
  resendVerification(@Body() body: EmailDto, @Req() request: FastifyRequest) {
    return this.auth.resendVerification(body.email, metadata(request));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  async login(
    @Body() body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const tokens = await this.auth.login(body, metadata(request));
    return this.withRefreshCookie(tokens, request, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshDto, required: false })
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const tokens = await this.auth.refresh(
      body.refreshToken ?? readCookie(request),
      metadata(request),
    );
    return this.withRefreshCookie(tokens, request, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LogoutDto, required: false })
  async logout(
    @Body() body: LogoutDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const result = await this.auth.logout(
      body.refreshToken ?? readCookie(request),
      metadata(request),
    );
    response.clearCookie('equa_refresh_token', { path: '/v1/auth' });
    return result;
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(@Req() request: AuthenticatedRequest) {
    return this.auth.logoutAll(request.user!.id, metadata(request));
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: EmailDto })
  forgotPassword(@Body() body: EmailDto, @Req() request: FastifyRequest) {
    return this.auth.forgotPassword(body.email, metadata(request));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ResetPasswordDto })
  resetPassword(@Body() body: ResetPasswordDto, @Req() request: FastifyRequest) {
    return this.auth.resetPassword(body.token, body.password, metadata(request));
  }

  private withRefreshCookie(
    tokens: Awaited<ReturnType<AuthService['login']>>,
    request: FastifyRequest,
    response: FastifyReply,
  ) {
    const isMobile = request.headers['x-equa-client'] === 'mobile';
    response.setCookie('equa_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: 60 * 60 * 24 * 30,
    });
    return isMobile
      ? tokens
      : { accessToken: tokens.accessToken, refreshExpiresAt: tokens.refreshExpiresAt };
  }
}

function metadata(request: FastifyRequest): RequestMetadata {
  return {
    correlationId: request.headers['x-correlation-id']?.toString() ?? 'unknown',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
function readCookie(request: FastifyRequest): string {
  return (request.cookies as Record<string, string | undefined>).equa_refresh_token ?? '';
}

function requireBody<T>(body: T | undefined): T {
  if (!body) throw new BadRequestException('Request body is required.');
  return body;
}
