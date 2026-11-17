import { describe, expect, it, vi } from 'vitest';

import { collectReport, renderReport } from './weekly-flaky-tests.mjs';

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

  it('reports a job that reached its time limit after all its steps passed', async () => {
    const report = await collect([job(18, 'E2E nuxt-4 Test', 'cancelled', [['Run E2E test', 'success']])], {
      18: [jobTimeout],
    });

    expect(report.steps).toEqual([
      {
        family: 'E2E Tests',
        name: 'No failed step',
        outcome: 'timed out',
        runs: new Map([[7, `${REPOSITORY_URL}/actions/runs/7/job/18`]]),
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

  it('ignores the gate job, which only repeats the failure of another job', async () => {
    const report = await collect(
      [job(14, 'All required jobs passed or were skipped', 'failure', [['Check for failures', 'failure']])],
      { 14: [processExit] },
    );

    expect(report.steps).toEqual([]);
    expect(report.failedJobs).toBe(0);
  });

  it('counts the same failed step of two E2E applications as one row', async () => {
    const steps = [['Install E2E app dependencies', 'failure']];
    const report = await collect(
      [job(15, 'E2E nuxt-4 Test', 'failure', steps), job(16, 'E2E hono-4 (bun) Test', 'failure', steps)],
      { 15: [processExit], 16: [processExit] },
    );

    expect(report.steps).toEqual([
      {
        family: 'E2E Tests',
        name: 'Install E2E app dependencies',
        outcome: 'failed',
        runs: new Map([[7, `${REPOSITORY_URL}/actions/runs/7/job/15`]]),
      },
    ]);
    expect(report.failedJobsWithoutTests).toBe(2);
  });
});

describe('renderReport', () => {
  it('renders a job failure outside a test in its own table', async () => {
    const report = await collect(
      [job(12, 'Playwright esm chromium Tests', 'cancelled', [['Install Playwright', 'cancelled']])],
      { 12: [jobTimeout] },
    );

    expect(renderReport(report, context).split('\n')).toEqual([
      '## Weekly test failures',
      '',
      'Develop · 2026-11-09–2026-11-16 · 1 CI runs.',
      '',
      'No test failures found.',
      '',
      '## Weekly job failures outside a test',
      '',
      '| Job | Step | Result | Affected runs | Links to runs |',
      '| --- | --- | --- | ---: | --- |',
      `| Playwright Tests | Install Playwright | timed out | 1 | [7](${REPOSITORY_URL}/actions/runs/7/job/12) |`,
      '',
      '1 failed job attempts; 1 without test annotations. Optional jobs and the required-jobs gate excluded.',
      '',
      '',
    ]);
  });
});
