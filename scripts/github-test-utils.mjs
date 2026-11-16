import { vi } from 'vitest';

const profiles = {
  a: { login: 'a', name: 'Alice Example' },
  b: { login: 'b', name: 'Bob Example' },
  c: { login: 'c', name: 'Carol Example' },
  d: { login: 'd', name: 'Dan Example' },
};

export function setup(run, pr) {
  const github = {
    paginate: vi.fn(async method => (method === github.rest.teams.listMembersInOrg ? Object.values(profiles) : [])),
    graphql: vi.fn(async () => ({})),
    rest: {
      pulls: {
        get: vi.fn(async () => ({
          data: {
            state: 'open',
            draft: false,
            assignees: [],
            requested_reviewers: [],
            base: { repo: { owner: { login: 'getsentry' } } },
            ...pr,
          },
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
  const core = { info: vi.fn(), warning: vi.fn() };
  return { github, run: () => run({ github, context, core }) };
}

export const junior = { login: 'sentry-junior[bot]', type: 'Bot' };

export const attribution = labels =>
  `Body\n\n<!-- junior-request-attribution:start -->\nvia ${labels}.\n<!-- junior-request-attribution:end -->\n`;
