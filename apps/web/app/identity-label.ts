export interface HumanIdentityLabelSource {
  id?: string;
  displayName?: string;
  email?: string;
  username?: string;
}

export function humanIdentityLabel(
  identity: HumanIdentityLabelSource | null | undefined,
  fallback = 'Người dùng Equa',
): string {
  return (
    nonEmpty(identity?.displayName) ??
    nonEmpty(identity?.email) ??
    nonEmpty(identity?.username) ??
    fallback
  );
}

export function humanIdentitySecondaryLabel(
  identity: HumanIdentityLabelSource | null | undefined,
  primaryLabel: string,
): string | undefined {
  const email = nonEmpty(identity?.email);
  return email && email !== primaryLabel ? email : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
