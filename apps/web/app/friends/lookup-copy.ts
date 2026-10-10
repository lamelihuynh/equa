export const FRIEND_LOOKUP_HELP_TEXT = 'Nhập email của người bạn muốn kết nối.';

export const FRIEND_EMAIL_VALIDATION_ERROR = 'Nhập email hợp lệ.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidFriendEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
