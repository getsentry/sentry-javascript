import { describe, expect, it, vi } from 'vitest';

import { collectReport } from './weekly-flaky-tests.mjs';

const REPOSITORY_URL = 'https://github.com/getsentry/sentry-javascript';
const context = { repo: { owner: 'getsentry', repo: 'sentry-javascript' }, serverUrl: 'https://github.com', runId: 99 };
const now = new Date('2026-11-16T06:00:00Z');

const jobTimeout = {
  annotation_level: 'failure',
  path: '.github',
  message: 'The job has exceeded the maximum execution time of 15m0s',
};
const processExit = { annotation_level: 'failure', path: '.github', message: 'Process completed with exit code 1.' };

function job(id, name, conclusion, steps) {
  return {
    id,
    name,
    conclusion,
    check_run_url: `https://api.github.com/repos/getsentry/sentry-javascript/check-runs/${id}`,
    html_url: `${REPOSITORY_URL}/actions/runs/7/job/${id}`,
    steps: steps.map(([stepName, stepConclusion]) => ({ name: stepName, conclusion: stepConclusion })),
  };
}

function collect(jobs, annotationsByJob) {
  const github = {
    rest: {
      actions: { listWorkflowRuns: vi.fn(), listJobsForWorkflowRun: vi.fn() },
      checks: { listAnnotations: vi.fn() },
    },
    paginate: vi.fn(async (method, params) => {
      if (method === github.rest.actions.listWorkflowRuns) {
        return [{ id: 7, event: 'push', conclusion: 'failure', run_attempt: 1 }];
      }
      if (method === github.rest.actions.listJobsForWorkflowRun) {
        return jobs;
      }
      return annotationsByJob[params.check_run_id] ?? [];
    }),
  };
  return collectReport({ github, context, core: { info: vi.fn() }, now });
}

describe('collectReport', () => {
  it('reports the failed step of a job that failed outside a test', async () => {
    const report = await collect(
      [
        job(11, 'Bun Unit Tests', 'failure', [
          ['Set up Bun', 'failure'],
          ['Run tests', 'skipped'],
        ]),
      ],
      { 11: [processExit] },
    );

    expect(report.steps).toEqual([
      {
        family: 'Bun Unit Tests',
        name: 'Set up Bun',
        outcome: 'failed',
        runs: new Map([[7, `${REPOSITORY_URL}/actions/runs/7/job/11`]]),
      },
    ]);
    expect(report.tests).toEqual([]);
  });

  it('reports a job that reached its time limit as timed out', async () => {
    const report = await collect(
      [
        job(12, 'Playwright esm chromium Tests', 'cancelled', [
          ['Restore caches', 'success'],
          ['Install Playwright', 'cancelled'],
          ['Run Playwright tests', 'cancelled'],
        ]),
      ],
      { 12: [jobTimeout] },
    );

    expect(report.steps).toEqual([
      {
        family: 'Playwright Tests',
        name: 'Install Playwright',
        outcome: 'timed out',
        runs: new Map([[7, `${REPOSITORY_URL}/actions/runs/7/job/12`]]),
      },
    ]);
  });

  it('ignores a cancelled job that did not time out', async () => {
    const report = await collect([job(13, 'Lint', 'cancelled', [['Lint source files', 'cancelled']])], {
      13: [{ annotation_level: 'failure', path: '.github', message: 'The operation was canceled.' }],
    });

    expect(report.steps).toEqual([]);
    expect(report.failedJobs).toBe(0);
  });
});
