import { Body, Controller, Get, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from '../auth/auth.dto';
import { AvatarService } from './avatar.service';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/profile')
export class ProfileController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}
  @Get('me') me(@Req() request: AuthenticatedRequest) {
    return this.auth.profile(request.user!.id);
  }
  @Get('me/avatar-url')
  async avatarUrl(@Req() request: AuthenticatedRequest) {
    const profile = await this.auth.profile(request.user!.id);
    return { url: profile.avatarKey ? await this.avatars.readUrl(profile.avatarKey) : null };
  }
  @Patch('me') update(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(request.user!.id, body);
  }
  @Post('me/avatar')
  async uploadAvatar(@Req() request: AuthenticatedRequest) {
    const file = await (request as FastifyRequest).file();
    if (!file) throw new Error('Avatar file is required.');
    const avatarKey = await this.avatars.upload(request.user!.id, file);
    return this.auth.updateProfile(request.user!.id, { avatarKey });
  }
}
