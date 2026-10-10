import { describe, expect, it } from 'vitest';

import {
  FRIEND_EMAIL_VALIDATION_ERROR,
  FRIEND_LOOKUP_HELP_TEXT,
  isValidFriendEmailAddress,
} from './lookup-copy';

describe('public Web friend lookup', () => {
  it('uses email-only helper and validation copy', () => {
    expect(FRIEND_LOOKUP_HELP_TEXT).toBe('Nhập email của người bạn muốn kết nối.');
    expect(FRIEND_EMAIL_VALIDATION_ERROR).toBe('Nhập email hợp lệ.');
  });

  it('accepts email addresses and rejects usernames or display names', () => {
    expect(isValidFriendEmailAddress('friend@example.com')).toBe(true);
    expect(isValidFriendEmailAddress(' friend+class@example.com ')).toBe(true);
    expect(isValidFriendEmailAddress('kydeptrai')).toBe(false);
    expect(isValidFriendEmailAddress('Kỳ đẹp trai')).toBe(false);
  });
});
