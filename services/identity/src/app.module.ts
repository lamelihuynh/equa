import { Module } from '@nestjs/common';

import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { TokenService } from './auth/token.service';
import { CorrelationIdInterceptor } from './common/correlation-id.interceptor';
import { IdentityConfigService } from './config/identity-config.service';
import { DatabaseService } from './database/database.service';
import { EmailService } from './email/email.service';
import { HealthController } from './health.controller';
import { IdentityController } from './identity/identity.controller';
import { ProfileController } from './profile/profile.controller';
import { AvatarService } from './profile/avatar.service';

@Module({
  controllers: [HealthController, AuthController, ProfileController, IdentityController],
  providers: [
    IdentityConfigService,
    DatabaseService,
    TokenService,
    EmailService,
    AuditService,
    AuthService,
    AuthGuard,
    AvatarService,
    CorrelationIdInterceptor,
  ],
})
export class AppModule {}
