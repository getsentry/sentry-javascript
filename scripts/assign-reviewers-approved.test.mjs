import { describe, expect, it } from 'vitest';

import { isApproved } from './assign-reviewers.mjs';

describe('isApproved', () => {
  const review = (login, state, type = 'User') => ({ user: { login, type }, state });

  it('is approved when a human approved', () => {
    expect(isApproved([review('a', 'COMMENTED'), review('b', 'APPROVED')])).toBe(true);
  });

  it('keeps an approval when the reviewer comments afterwards', () => {
    expect(isApproved([review('a', 'APPROVED'), review('A', 'COMMENTED')])).toBe(true);
  });

  it('is not approved when the approval was superseded by a change request or dismissed', () => {
    expect(isApproved([review('a', 'APPROVED'), review('A', 'CHANGES_REQUESTED')])).toBe(false);
    expect(isApproved([review('a', 'DISMISSED')])).toBe(false);
  });

  it('ignores approvals from bots', () => {
    expect(isApproved([review('some-ai[bot]', 'APPROVED', 'Bot')])).toBe(false);
  });
});
