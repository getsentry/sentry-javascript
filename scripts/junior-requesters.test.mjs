import { describe, expect, it } from 'vitest';

import { attribution, junior, setup } from './github-test-utils.mjs';
import { assignJuniorRequesters, parseJuniorRequesters, resolveLoginByName } from './junior-requesters.mjs';

describe('parseJuniorRequesters', () => {
  it('reads linked logins and Slack names', () => {
    expect(parseJuniorRequesters(attribution('**Jan Peer Stöcklmair**, @BYK'))).toEqual([
      { name: 'Jan Peer Stöcklmair' },
      { login: 'BYK' },
    ]);
  });

  it('skips automation runs', () => {
    expect(
      parseJuniorRequesters(
        attribution('[automation `sched_1`](https://junior-prod.sentry.dev/automations/sched_1) · Run ID `sched_1:1`'),
      ),
    ).toEqual([]);
  });

  it('returns nothing without an attribution block', () => {
    expect(parseJuniorRequesters('Some body')).toEqual([]);
    expect(parseJuniorRequesters(null)).toEqual([]);
  });
});

describe('resolveLoginByName', () => {
  const members = [
    { login: 'mydea', name: 'Francesco Gringl-Novy' },
    { login: 'JPeer264', name: 'Jan Peer Stöcklmair' },
    { login: 's1gr1d', name: 'Sigrid' },
    { login: 'isaacs', name: 'isaacs' },
    { login: 'noname', name: null },
  ];

  it('matches the full profile name, ignoring case and accents', () => {
    expect(resolveLoginByName('francesco gringl-novy', members)).toBe('mydea');
    expect(resolveLoginByName('Jan Peer Stocklmair', members)).toBe('JPeer264');
  });

  it('matches a single-word profile name to the first name', () => {
    expect(resolveLoginByName('Sigrid Someone', members)).toBe('s1gr1d');
  });

  it('does not match a first name that is ambiguous', () => {
    expect(resolveLoginByName('Sigrid Someone', [...members, { login: 'other', name: 'Sigrid' }])).toBeUndefined();
  });

  it('uses the manual mapping for names that cannot be matched', () => {
    expect(resolveLoginByName('Isaac Schlueter', members)).toBe('isaacs');
  });

  it('does not match unknown people', () => {
    expect(resolveLoginByName('Francesco Someone', members)).toBeUndefined();
  });
});

describe('assignJuniorRequesters', () => {
  it('assigns a Junior PR to its requester', async () => {
    const { github, run } = setup(assignJuniorRequesters, {
      user: junior,
      draft: true,
      body: attribution('**Alice Example**'),
    });
    await run();
    expect(github.rest.issues.addAssignees).toHaveBeenCalledWith(expect.objectContaining({ assignees: ['a'] }));
  });

  it('keeps existing assignees', async () => {
    const { github, run } = setup(assignJuniorRequesters, {
      user: junior,
      assignees: [{ login: 'b' }],
      body: attribution('@a'),
    });
    await run();
    expect(github.rest.issues.addAssignees).not.toHaveBeenCalled();
  });

  it('does not assign PRs opened by people', async () => {
    const { github, run } = setup(assignJuniorRequesters, {
      user: { login: 'b', type: 'User' },
      body: attribution('@a'),
    });
    await run();
    expect(github.rest.issues.addAssignees).not.toHaveBeenCalled();
  });
});
