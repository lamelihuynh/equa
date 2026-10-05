import type { DomainEvent } from './automation.js';

export const GROUP_INVITATION_CREATED_EVENT = 'group.invitation.created' as const;

export interface GroupInvitationNotificationPayload extends Record<string, unknown> {
  invitationId: string;
  groupId: string;
  groupName: string;
  groupType: 'trip' | 'household' | 'event' | 'other';
  inviterName: string;
  inviterEmail: string;
  recipientEmail: string;
  appUrl: string;
}

export interface GroupInvitationCreatedEvent extends DomainEvent {
  type: typeof GROUP_INVITATION_CREATED_EVENT;
  payload: GroupInvitationNotificationPayload;
}
