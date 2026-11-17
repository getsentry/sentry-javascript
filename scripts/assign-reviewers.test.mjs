import { describe, expect, it, vi } from 'vitest';

import { assignReviewers, getBusyLogins, getReviewLoad, pickReviewers } from './assign-reviewers.mjs';
import { attribution, junior, setup } from './github-test-utils.mjs';

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

  it('prefers the people with the fewest pending review requests', () => {
    const load = new Map([
      ['a', 4],
      ['b', 0],
      ['c', 2],
      ['d', 1],
      ['e', 3],
    ]);
    const picked = pickReviewers({
      existing: [],
      codeownerPool: [],
      teamPool: ['A', 'b', 'c', 'd', 'e'],
      exclude: [],
      load,
    });
    expect(picked).toEqual(['b', 'd', 'c']);
  });

  it('still prefers codeowners over less loaded team members', () => {
    const load = new Map([['x1', 5]]);
    const picked = pickReviewers({ existing: [], codeownerPool: ['x1'], teamPool: ['a', 'b'], exclude: [], load });
    expect(picked[0]).toBe('x1');
  });
});

describe('getReviewLoad', () => {
  const now = Date.parse('2026-01-10T00:00:00Z');
  const requested = (login, createdAt) => ({
    __typename: 'ReviewRequestedEvent',
    createdAt,
    requestedReviewer: { login },
  });
  const removed = (login, createdAt) => ({
    __typename: 'ReviewRequestRemovedEvent',
    createdAt,
    requestedReviewer: { login },
  });
  const page = (nodes, hasNextPage = false) => ({
    repository: { pullRequests: { pageInfo: { hasNextPage, endCursor: 'next' }, nodes } },
  });
  const pr = (updatedAt, events) => ({ updatedAt, timelineItems: { nodes: events } });

  it('counts the PRs each user was asked to review in the last 7 days', async () => {
    const github = {
      graphql: vi.fn(async () =>
        page([
          pr('2026-01-09T00:00:00Z', [requested('A', '2026-01-08T00:00:00Z'), requested('b', '2026-01-08T00:00:00Z')]),
          pr('2026-01-08T00:00:00Z', [requested('a', '2026-01-07T00:00:00Z'), requested('a', '2026-01-07T01:00:00Z')]),
          pr('2026-01-07T00:00:00Z', [requested('c', '2025-12-01T00:00:00Z'), requested('d', '2026-01-06T00:00:00Z')]),
        ]),
      ),
    };
    const load = await getReviewLoad({ github, core: { warning: vi.fn() }, owner: 'o', repo: 'r', now });
    expect(load).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
        ['d', 1],
      ]),
    );
  });

  it('does not count review requests that were removed again', async () => {
    const github = {
      graphql: vi.fn(async () =>
        page([
          pr('2026-01-09T00:00:00Z', [
            requested('a', '2026-01-08T00:00:00Z'),
            requested('b', '2026-01-08T00:00:00Z'),
            removed('a', '2026-01-08T01:00:00Z'),
          ]),
        ]),
      ),
    };
    const load = await getReviewLoad({ github, core: { warning: vi.fn() }, owner: 'o', repo: 'r', now });
    expect(load).toEqual(new Map([['b', 1]]));
  });

  it('pages until it reaches PRs last updated before the window', async () => {
    const github = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce(page([pr('2026-01-09T00:00:00Z', [requested('a', '2026-01-08T00:00:00Z')])], true))
        .mockResolvedValueOnce(
          page(
            [
              pr('2026-01-08T00:00:00Z', [requested('b', '2026-01-08T00:00:00Z')]),
              pr('2025-12-01T00:00:00Z', [requested('c', '2025-12-01T00:00:00Z')]),
            ],
            true,
          ),
        ),
    };
    const load = await getReviewLoad({ github, core: { warning: vi.fn() }, owner: 'o', repo: 'r', now });
    expect(load).toEqual(
      new Map([
        ['a', 1],
        ['b', 1],
      ]),
    );
    expect(github.graphql).toHaveBeenCalledTimes(2);
    expect(github.graphql).toHaveBeenLastCalledWith(expect.any(String), { owner: 'o', repo: 'r', cursor: 'next' });
  });

  it('treats everyone as unloaded when the query fails', async () => {
    const core = { warning: vi.fn() };
    const github = { graphql: vi.fn(async () => Promise.reject(new Error('boom'))) };
    expect(await getReviewLoad({ github, core, owner: 'o', repo: 'r', now })).toEqual(new Map());
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('boom'));
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
      expect.objectContaining({ reviewers: [expect.any(String), expect.any(String), expect.any(String)] }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['a']) }),
    );
  });

  it('falls back to the contractors as well as the team', async () => {
    const { github, run } = setup(assignReviewers, { user: { login: 'author', type: 'User' } });
    const busy = login => ({ login, status: { indicatesLimitedAvailability: true } });
    github.graphql.mockResolvedValue({ u0: busy('a'), u1: busy('b'), u2: busy('c') });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.arrayContaining(['d', 'timfish', 'RulaKhaled']) }),
    );
  });

  it('does not request a review from the requester of a Junior PR', async () => {
    const { github, run } = setup(assignReviewers, { user: junior, body: attribution('**Alice Example**') });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: [expect.any(String), expect.any(String), expect.any(String)] }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['a']) }),
    );
  });

  it('requests reviews from the team members who were asked for the fewest reviews recently', async () => {
    const { github, run } = setup(assignReviewers, { user: { login: 'author', type: 'User' } });
    const recently = login => ({
      __typename: 'ReviewRequestedEvent',
      createdAt: new Date().toISOString(),
      requestedReviewer: { login },
    });
    const pr = logins => ({ updatedAt: new Date().toISOString(), timelineItems: { nodes: logins.map(recently) } });
    github.graphql.mockImplementation(async query =>
      query.includes('timelineItems')
        ? {
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  pr(['a', 'b', 'c', 'timfish', 'RulaKhaled']),
                  pr(['a', 'b', 'timfish', 'RulaKhaled']),
                  pr(['a', 'timfish', 'RulaKhaled']),
                ],
              },
            },
          }
        : {},
    );
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: ['d', 'c', 'b'] }),
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

  it('does not count the assignee towards the required reviewers, nor request their review', async () => {
    const { github, run } = setup(assignReviewers, {
      user: { login: 'author', type: 'User' },
      assignees: [{ login: 'A', type: 'User' }],
      requested_reviewers: [{ login: 'a', type: 'User' }],
    });
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: [expect.any(String), expect.any(String), expect.any(String)] }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['a']) }),
    );
  });

  it('does not count reviews from the requester of a Junior PR towards the required reviewers', async () => {
    const { github, run } = setup(assignReviewers, { user: junior, body: attribution('@a') });
    const paginate = github.paginate.getMockImplementation();
    github.paginate.mockImplementation(async method =>
      method === github.rest.pulls.listReviews
        ? [{ user: { login: 'a', type: 'User' } }, { user: { login: 'mydea', type: 'User' } }]
        : paginate(method),
    );
    await run();
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: [expect.any(String), expect.any(String), expect.any(String)] }),
    );
    expect(github.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: expect.not.arrayContaining(['a']) }),
    );
  });
});
