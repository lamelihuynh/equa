import { Inject, Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

import { IdentityConfigService } from '../config/identity-config.service';

@Injectable()
export class EmailService {
  constructor(@Inject(IdentityConfigService) private readonly config: IdentityConfigService) {}

  async sendVerification(to: string, token: string): Promise<void> {
    await this.send(
      to,
      'Verify your Equa email',
      `Verify your account: ${this.config.appWebUrl}/verify-email?token=${encodeURIComponent(token)}`,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    await this.send(
      to,
      'Reset your Equa password',
      `Reset your password: ${this.config.appWebUrl}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (this.config.emailProvider === 'resend') {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error('RESEND_API_KEY must be configured when EMAIL_PROVIDER=resend.');
      const result = await new Resend(apiKey).emails.send({
        from: this.config.emailFrom,
        to: [to],
        subject,
        text,
      });
      if (result.error) throw new Error(`Resend email failed: ${result.error.message}`);
      return;
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
    await transport.sendMail({ from: this.config.emailFrom, to, subject, text });
  }
}
