import { describe, expect, it, vi } from 'vitest';

import { GROUP_INVITATION_CREATED_EVENT, type NotificationJob } from '@equa/contracts';

import { MailpitNotificationProvider, createNotificationProvider } from './mailpit.provider';
import { DisabledNotificationProvider } from './notification.worker';

describe('MailpitNotificationProvider', () => {
  it('sends a human-readable invitation with an app link and no invitation code', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const provider = new MailpitNotificationProvider({ sendMail }, 'Equa <no-reply@example.test>');
    const job: NotificationJob = {
      eventId: 'invitation-1',
      deliveryId: 'notification:invitation-1:user-1',
      ownerId: 'user-1',
      type: GROUP_INVITATION_CREATED_EVENT,
      payload: {
        recipientEmail: 'bob@example.test',
        inviterName: 'Alice Nguyen',
        inviterEmail: 'alice@example.test',
        groupName: 'Da Lat Trip',
        appUrl: 'http://localhost:3000/groups',
      },
    };

    await provider.deliver(job, job.deliveryId);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Equa <no-reply@example.test>',
        to: 'bob@example.test',
        subject: 'Invitation to Da Lat Trip on Equa',
        messageId: '<notification-invitation-1-user-1@equa.local>',
      }),
    );
    const message = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toContain('Alice Nguyen (alice@example.test)');
    expect(message.text).toContain('Da Lat Trip');
    expect(message.text).toContain('http://localhost:3000/groups');
    expect(message.text.toLowerCase()).not.toContain('copy the code');
  });

  it('leaves delivery disabled outside explicit local Mailpit configuration', () => {
    const provider = createNotificationProvider({ EMAIL_PROVIDER: 'resend' });
    expect(provider).toBeInstanceOf(DisabledNotificationProvider);
  });
});
