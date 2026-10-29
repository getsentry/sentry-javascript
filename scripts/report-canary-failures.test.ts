import { describe, expect, it, vi } from 'vitest';
import run, { getFailedVariantsByApp, issueTitle } from './report-canary-failures.mjs';

const matrix = {
  include: [
    { 'test-application': 'nextjs-16', label: 'nextjs-16 (canary, turbopack)' },
    { 'test-application': 'nextjs-16', label: 'nextjs-16 (canary, webpack)' },
    { 'test-application': 'nuxt-4', label: 'nuxt-4 (canary)' },
    { 'test-application': 'vue-3' },
  ],
};

const jobs = [
  { name: 'Prepare E2E Canary tests', conclusion: 'success', html_url: 'https://jobs/prepare' },
  { name: 'E2E nextjs-16 (canary, turbopack) Test', conclusion: 'failure', html_url: 'https://jobs/1' },
  { name: 'E2E nextjs-16 (canary, webpack) Test', conclusion: 'timed_out', html_url: 'https://jobs/2' },
  { name: 'E2E nuxt-4 (canary) Test', conclusion: 'success', html_url: 'https://jobs/3' },
  { name: 'E2E vue-3 Test', conclusion: 'failure', html_url: 'https://jobs/4' },
];

function createGithub(openIssues: Array<{ number: number; title: string; pull_request?: object }>) {
  const listJobsForWorkflowRun = vi.fn();
  const listForRepo = vi.fn();
  const createComment = vi.fn();
  const create = vi.fn().mockResolvedValue({ data: { number: 123 } });

  return {
    rest: {
      actions: { listJobsForWorkflowRun },
      issues: { listForRepo, createComment, create },
    },
    paginate: vi.fn(async (method: unknown) => (method === listJobsForWorkflowRun ? jobs : openIssues)),
  };
}

const context = { repo: { owner: 'getsentry', repo: 'sentry-javascript' }, serverUrl: 'https://github.com', runId: 42 };
const core = { info: vi.fn() };
const runUrl = 'https://github.com/getsentry/sentry-javascript/actions/runs/42';

describe('getFailedVariantsByApp', () => {
  it('groups failed and timed out jobs by test application', () => {
    expect(getFailedVariantsByApp(matrix, jobs)).toEqual(
      new Map([
        [
          'nextjs-16',
          [
            { label: 'nextjs-16 (canary, turbopack)', url: 'https://jobs/1' },
            { label: 'nextjs-16 (canary, webpack)', url: 'https://jobs/2' },
          ],
        ],
        ['vue-3', [{ label: 'vue-3', url: 'https://jobs/4' }]],
      ]),
    );
  });
});

describe('run', () => {
  it('opens one issue per failed test application', async () => {
    const github = createGithub([]);

    await run({ github, context, core, matrix });

    expect(github.rest.issues.create).toHaveBeenCalledTimes(2);
    expect(github.rest.issues.create).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry-javascript',
      title: issueTitle('nextjs-16'),
      labels: ['Type: Tests', 'Waiting for: Product Owner'],
      body: expect.stringContaining(runUrl),
    });
    expect(github.rest.issues.create).toHaveBeenCalledWith(expect.objectContaining({ title: issueTitle('vue-3') }));
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('comments on the open issue of a test application instead of opening another one', async () => {
    const github = createGithub([
      { number: 7, title: issueTitle('nextjs-16') },
      { number: 8, title: issueTitle('vue-3'), pull_request: {} },
    ]);

    await run({ github, context, core, matrix });

    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry-javascript',
      issue_number: 7,
      body: expect.stringContaining(runUrl),
    });
    expect(github.rest.issues.create).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.create).toHaveBeenCalledWith(expect.objectContaining({ title: issueTitle('vue-3') }));
  });

  it('does nothing when no canary test failed', async () => {
    const github = createGithub([]);

    await run({ github, context, core, matrix: { include: [matrix.include[2]] } });

    expect(github.paginate).toHaveBeenCalledTimes(1);
    expect(github.rest.issues.create).not.toHaveBeenCalled();
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
