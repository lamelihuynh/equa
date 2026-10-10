import { describe, expect, it } from 'vitest';

import { FRIEND_LOOKUP_HELP_TEXT } from './lookup-copy';

describe('friend lookup helper copy', () => {
  it('clarifies email and username lookup without treating display name as an identifier', () => {
    expect(FRIEND_LOOKUP_HELP_TEXT).toBe(
      'Tìm bằng email hoặc username. Tên hiển thị không dùng để tìm bạn.',
    );
  });
});
