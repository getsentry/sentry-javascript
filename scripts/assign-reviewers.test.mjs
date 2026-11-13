import { describe, expect, it, vi } from 'vitest';

import {
  assignReviewers,
  getBusyLogins,
  getOwnersForFiles,
  parseCodeowners,
  pickReviewers,
} from './assign-reviewers.mjs';
import { attribution, junior, setup } from './github-test-utils.mjs';

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

describe('getBusyLogins', () => {
  const core = { warning: vi.fn() };

  it('returns users whose status indicates limited availability', async () => {
    const github = {
      graphql: vi.fn(async () => ({
        u0: { login: 'a', status: { indicatesLimitedAvailability: true } },
        u1: { login: 'b', status: { indicatesLimitedAvailability: false } },
        u2: { login: 'c', status: null },
      })),
    };
    expect(await getBusyLogins({ github, core, logins: ['a', 'b', 'c', 'A'] })).toEqual(['a']);
    expect(github.graphql).toHaveBeenCalledWith(expect.any(String), { l0: 'A', l1: 'b', l2: 'c' });
  });

  it('skips the query when there are no logins', async () => {
    const github = { graphql: vi.fn() };
    expect(await getBusyLogins({ github, core, logins: [] })).toEqual([]);
    expect(github.graphql).not.toHaveBeenCalled();
  });

  it('treats nobody as busy when the query fails', async () => {
    const github = { graphql: vi.fn(async () => Promise.reject(new Error('boom'))) };
    expect(await getBusyLogins({ github, core, logins: ['a'] })).toEqual([]);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});

describe('assignReviewers', () => {
  it('does not request a review from busy users', async () => {
    const { github, run } = setup(assignReviewers, { user: { login: 'author', type: 'User' } });
    github.graphql.mockResolvedValue({ u0: { login: 'a', status: { indicatesLimitedAvailability: true } } });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.arrayContaining(['b', 'c', 'd']) }),
    );
  });

  it('does not request a review from the requester of a Junior PR', async () => {
    const { github, run } = setup(assignReviewers, { user: junior, body: attribution('**Alice Example**') });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.arrayContaining(['b', 'c', 'd']) }),
    );
  });

  it('does not count pending review requests from managers towards the required reviewers', async () => {
    const { github, run } = setup(assignReviewers, {
      user: { login: 'author', type: 'User' },
      requested_reviewers: [
        { login: 'Mydea', type: 'User' },
        { login: 'a', type: 'User' },
      ],
    });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: [expect.any(String), expect.any(String)] }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['a']) }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['Mydea']) }),
    );
  });
});
