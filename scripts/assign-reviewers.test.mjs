import { describe, expect, it, vi } from 'vitest';

import {
  assignReviewers,
  getOwnersForFiles,
  parseCodeowners,
  parseJuniorRequesters,
  pickReviewers,
  resolveLoginByName,
} from './assign-reviewers.mjs';

const CODEOWNERS = `
# comment
/packages/browser/      @getsentry/browser
/packages/node/         @getsentry/server
/packages/node/src/x.ts @someone
*.md                    @getsentry/docs
`;

describe('getOwnersForFiles', () => {
  const rules = parseCodeowners(CODEOWNERS);

  it('collects owners across all touched files', () => {
    expect(getOwnersForFiles(rules, ['packages/browser/src/index.ts', 'packages/node/src/sdk.ts'])).toEqual([
      '@getsentry/browser',
      '@getsentry/server',
    ]);
  });

  it('uses the last matching rule for a file', () => {
    expect(getOwnersForFiles(rules, ['packages/node/src/x.ts'])).toEqual(['@someone']);
  });

  it('matches unanchored patterns at any depth', () => {
    expect(getOwnersForFiles(rules, ['packages/node/README.md'])).toEqual(['@getsentry/docs']);
  });

  it('does not match sibling directories that share a prefix', () => {
    expect(getOwnersForFiles(rules, ['packages/browser-utils/src/index.ts', 'packages/nodejs/a.ts'])).toEqual([]);
  });
});

describe('pickReviewers', () => {
  const teamPool = ['a', 'b', 'c', 'd', 'e', 'mydea'];

  it('picks only from the codeowner pool when it is large enough', () => {
    const picked = pickReviewers({
      existing: [],
      codeownerPool: ['x1', 'x2', 'x3', 'y1', 'y2', 'y3'],
      teamPool,
      exclude: [],
    });
    expect(picked).toHaveLength(3);
    picked.forEach(login => expect(['x1', 'x2', 'x3', 'y1', 'y2', 'y3']).toContain(login));
  });

  it('fills up from the team when the codeowner pool is too small', () => {
    const picked = pickReviewers({ existing: [], codeownerPool: ['x1'], teamPool, exclude: ['mydea'] });
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe('x1');
    expect(picked).not.toContain('mydea');
  });

  it('picks from the whole team when no codeowners match', () => {
    const picked = pickReviewers({ existing: [], codeownerPool: [], teamPool: ['a', 'b', 'c'], exclude: [] });
    expect(picked.sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b', 'c']);
  });

  it('never picks the author, excluded people, or existing reviewers, case-insensitively', () => {
    const picked = pickReviewers({
      existing: ['B'],
      codeownerPool: ['A', 'b', 'Mydea'],
      teamPool: ['a', 'c', 'd'],
      exclude: ['a', 'mydea'],
    });
    expect(picked.sort((a, b) => a.localeCompare(b))).toEqual(['c', 'd']);
  });

  it('only tops up to the required number of reviewers', () => {
    expect(pickReviewers({ existing: ['x', 'y'], codeownerPool: [], teamPool, exclude: [] })).toHaveLength(1);
    expect(pickReviewers({ existing: ['x', 'y', 'z'], codeownerPool: [], teamPool, exclude: [] })).toEqual([]);
  });

  it('returns fewer reviewers when not enough people are eligible', () => {
    expect(pickReviewers({ existing: [], codeownerPool: [], teamPool: ['a'], exclude: [] })).toEqual(['a']);
  });
});

const attribution = labels =>
  `Body\n\n<!-- junior-request-attribution:start -->\nvia ${labels}.\n<!-- junior-request-attribution:end -->\n`;

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

describe('assignReviewers', () => {
  const profiles = {
    a: { login: 'a', name: 'Alice Example' },
    b: { login: 'b', name: 'Bob Example' },
    c: { login: 'c', name: 'Carol Example' },
    d: { login: 'd', name: 'Dan Example' },
  };

  function setup(pr) {
    const github = {
      paginate: vi.fn(async method => (method === github.rest.teams.listMembersInOrg ? Object.values(profiles) : [])),
      rest: {
        pulls: {
          get: vi.fn(async () => ({
            data: { state: 'open', draft: false, assignees: [], requested_reviewers: [], ...pr },
          })),
          listReviews: vi.fn(),
          listFiles: vi.fn(),
          requestReviewers: vi.fn(),
        },
        teams: { listMembersInOrg: vi.fn() },
        users: { getByUsername: vi.fn(async ({ username }) => ({ data: profiles[username] })) },
        issues: { addAssignees: vi.fn() },
      },
    };
    const context = {
      repo: { owner: 'getsentry', repo: 'sentry-javascript' },
      payload: { pull_request: { number: 1 } },
    };
    const core = { info: vi.fn() };
    return { github, run: () => assignReviewers({ github, context, core }) };
  }

  const junior = { login: 'sentry-junior[bot]', type: 'Bot' };

  it('assigns a draft Junior PR to its requester without requesting reviews', async () => {
    const { github, run } = setup({ user: junior, draft: true, body: attribution('**Alice Example**') });
    await run();
    expect(github.rest.issues.addAssignees).toHaveBeenCalledWith(expect.objectContaining({ assignees: ['a'] }));
    expect(github.rest.pulls.requestReviewers).not.toHaveBeenCalled();
  });

  it('does not request a review from the requester of a Junior PR', async () => {
    const { github, run } = setup({ user: junior, body: attribution('@a') });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.arrayContaining(['b', 'c', 'd']) }),
    );
  });

  it('keeps existing assignees', async () => {
    const { github, run } = setup({ user: junior, assignees: [{ login: 'b' }], body: attribution('@a') });
    await run();
    expect(github.rest.issues.addAssignees).not.toHaveBeenCalled();
  });

  it('does not assign PRs opened by people', async () => {
    const { github, run } = setup({ user: { login: 'b', type: 'User' }, body: attribution('@a') });
    await run();
    expect(github.rest.issues.addAssignees).not.toHaveBeenCalled();
  });
});
