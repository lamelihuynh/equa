import nodemailer from 'nodemailer';

import { GROUP_INVITATION_CREATED_EVENT, type NotificationJob } from '@equa/contracts';

import { DisabledNotificationProvider, type NotificationProvider } from './notification.worker.js';

interface InvitationMailPayload {
  recipientEmail: string;
  inviterName: string;
  inviterEmail: string;
  groupName: string;
  appUrl: string;
}

interface MailpitMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
}

export interface MailpitTransport {
  sendMail(message: MailpitMessage): Promise<unknown>;
}

export class MailpitNotificationProvider implements NotificationProvider {
  readonly enabled = true;
  readonly supportedTypes = [GROUP_INVITATION_CREATED_EVENT];

  constructor(
    private readonly transport: MailpitTransport,
    private readonly from: string,
  ) {}

  async deliver(job: NotificationJob, idempotencyKey: string): Promise<void> {
    if (job.type !== GROUP_INVITATION_CREATED_EVENT)
      throw new Error(`Unsupported Mailpit notification type: ${job.type}`);
    const invitation = invitationPayload(job.payload);
    const text = [
      `You have been invited by ${invitation.inviterName} (${invitation.inviterEmail}) to join "${invitation.groupName}" on Equa.`,
      '',
      `Sign in as ${invitation.recipientEmail} and open Equa to accept or decline this invitation:`,
      invitation.appUrl,
      '',
      'The invitation is stored in Equa. This email is only a notification.',
    ].join('\n');
    await this.transport.sendMail({
      from: this.from,
      to: invitation.recipientEmail,
      subject: `Invitation to ${invitation.groupName} on Equa`,
      text,
      messageId: `<${safeMessageId(idempotencyKey)}@equa.local>`,
    });
  }
}

export function createNotificationProvider(
  environment: NodeJS.ProcessEnv = process.env,
): NotificationProvider {
  if (environment.EMAIL_PROVIDER !== 'mailpit') return new DisabledNotificationProvider();
  const transport = nodemailer.createTransport({
    host: environment.SMTP_HOST ?? '127.0.0.1',
    port: Number(environment.SMTP_PORT ?? 1025),
    secure: false,
  });
  return new MailpitNotificationProvider(
    { sendMail: (message) => transport.sendMail(message) },
    environment.EMAIL_FROM ?? 'Equa <no-reply@localhost>',
  );
}

function invitationPayload(value: Record<string, unknown>): InvitationMailPayload {
  if (
    typeof value.recipientEmail !== 'string' ||
    !value.recipientEmail.trim() ||
    typeof value.inviterName !== 'string' ||
    !value.inviterName.trim() ||
    typeof value.inviterEmail !== 'string' ||
    !value.inviterEmail.trim() ||
    typeof value.groupName !== 'string' ||
    !value.groupName.trim() ||
    typeof value.appUrl !== 'string' ||
    !value.appUrl.trim()
  )
    throw new Error('Group invitation notification is missing email content.');
  return {
    recipientEmail: value.recipientEmail,
    inviterName: value.inviterName,
    inviterEmail: value.inviterEmail,
    groupName: value.groupName,
    appUrl: value.appUrl,
  };
}

function safeMessageId(value: string): string {
  return value.replace(/[^a-z0-9.-]/gi, '-');
}
