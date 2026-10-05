export interface IdentityLabel {
  displayName?: string | null;
  email?: string | null;
  username?: string | null;
}

export function humanIdentityLabel(identity: IdentityLabel | null | undefined): string {
  const displayName = identity?.displayName?.trim();
  if (displayName) return displayName;
  const email = identity?.email?.trim();
  if (email) return email;
  const username = identity?.username?.trim();
  if (username) return username;
  return 'Người dùng Equa';
}
