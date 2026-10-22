import { describe, expect, it, vi } from 'vitest';
import { FLAKY_ANNOTATION_PREFIX } from './ci-report-flaky-tests.mjs';
import { collectReport, FLAKY_STEP_NAME, normalizeJobName, renderReport } from './weekly-flaky-tests.mjs';

const context = { repo: { owner: 'getsentry', repo: 'sentry-javascript' }, serverUrl: 'https://github.com', runId: 1 };
const core = { info: vi.fn(), warning: vi.fn() };

function job(id: number, name: string, conclusion: string, stepNames: string[] = []) {
  return {
    id,
    name,
    conclusion,
    html_url: `https://github.com/job/${id}`,
    check_run_url: `https://api.github.com/check-runs/${id}`,
    steps: stepNames.map(stepName => ({ name: stepName, conclusion: 'success' })),
  };
}

function annotation(path: string, title: string) {
  return { annotation_level: 'failure', path, title };
}

function flakyAnnotation(path: string, title: string) {
  return { annotation_level: 'warning', path, title: `${FLAKY_ANNOTATION_PREFIX}${title}` };
}

function createGithub(
  runs: unknown[],
  jobsByRun: Record<number, unknown[]>,
  annotationsByCheckRun: Record<number, unknown[]>,
) {
  const listWorkflowRuns = vi.fn();
  const listJobsForWorkflowRun = vi.fn();
  const listAnnotations = vi.fn();
  return {
    rest: { actions: { listWorkflowRuns, listJobsForWorkflowRun }, checks: { listAnnotations } },
    paginate: vi.fn(async (method: unknown, params: { run_id?: number; check_run_id?: number }) => {
      if (method === listWorkflowRuns) {
        return runs;
      }
      if (method === listJobsForWorkflowRun) {
        return jobsByRun[params.run_id as number] ?? [];
      }
      return annotationsByCheckRun[params.check_run_id as number] ?? [];
    }),
  };
}

describe('normalizeJobName', () => {
  it('groups the E2E jobs, whose test paths name the app', () => {
    expect(normalizeJobName('E2E angular-17, angular-18, astro-4, astro-5 Test')).toBe('E2E Tests');
    expect(normalizeJobName('E2E nextjs-16 (latest) Test')).toBe('E2E Tests');
  });

  it('keeps removing the shard and Node version', () => {
    expect(normalizeJobName('Node (22) Integration Tests (2/3)')).toBe('Node Integration Tests');
  });
});

describe('collectReport', () => {
  const flakyPath = '../../_temp/e2e/nextjs-16/tests/flaky.test.ts';
  const failingPath = 'dev-packages/browser-integration-tests/suites/a/test.ts';

  it('counts tests that passed on retry in passing runs, and tests that failed', async () => {
    const github = createGithub(
      [
        { id: 10, event: 'push', conclusion: 'success', run_attempt: 1 },
        { id: 11, event: 'push', conclusion: 'failure', run_attempt: 1 },
        { id: 12, event: 'pull_request', conclusion: 'failure', run_attempt: 1 },
      ],
      {
        10: [
          job(100, 'E2E nextjs-16, nuxt-4 Test', 'success', ['Run E2E test', FLAKY_STEP_NAME]),
          job(101, 'E2E astro-4 Test', 'success', ['Run E2E test']),
        ],
        11: [
          job(110, 'E2E nextjs-16, nuxt-4 Test', 'success', ['Run E2E test', FLAKY_STEP_NAME]),
          job(111, 'Playwright esm (1/4) Tests', 'failure'),
          job(112, 'E2E astro-4 Test (optional)', 'failure'),
        ],
      },
      {
        100: [
          annotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
          flakyAnnotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
        ],
        101: [annotation('../../_temp/e2e/astro-4/tests/a.test.ts', '[chromium] › a.test.ts:1:1 › unused')],
        110: [
          annotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
          flakyAnnotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
        ],
        111: [annotation(failingPath, '[chromium] › a/test.ts:1:1 › fails')],
      },
    );

    const report = await collectReport({ github, context, core, now: new Date('2026-10-22T00:00:00Z') });

    expect(github.paginate).not.toHaveBeenCalledWith(
      github.rest.checks.listAnnotations,
      expect.objectContaining({ check_run_id: 101 }),
    );
    expect(github.paginate).not.toHaveBeenCalledWith(
      github.rest.checks.listAnnotations,
      expect.objectContaining({ check_run_id: 112 }),
    );
    expect(report).toMatchObject({ runs: 2, failedJobs: 1, retriedJobs: 2, failedJobsWithoutTests: 0 });
    expect(
      report.tests.map(test => [test.family, test.path, test.name, test.runs.size, test.retriedRuns.size]),
    ).toEqual([
      ['E2E Tests', flakyPath, 'flaky.test.ts › works', 2, 2],
      ['Playwright Tests', failingPath, 'a/test.ts › fails', 1, 0],
    ]);

    const markdown = renderReport(report, context);
    expect(markdown).toContain('| Test | Job | Affected runs | Passed on retry | Links to runs | Issue |');
    expect(markdown).toContain('2 jobs had tests that passed on retry.');
  });

  it('tells the tests that passed on retry from the tests that failed in the same job', async () => {
    const github = createGithub(
      [{ id: 20, event: 'push', conclusion: 'failure', run_attempt: 1 }],
      {
        20: [job(200, 'E2E nextjs-16, nuxt-4 Test', 'failure', ['Run E2E test', FLAKY_STEP_NAME])],
      },
      {
        200: [
          annotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
          annotation(flakyPath, '[chromium] › flaky.test.ts:9:5 › breaks'),
          annotation(flakyPath, '[chromium] › flaky.test.ts:9:5 › breaks'),
          flakyAnnotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
          // Its failure annotation fell over GitHub's limit of failure annotations per step
          flakyAnnotation(flakyPath, '[chromium] › flaky.test.ts:12:5 › also works'),
        ],
      },
    );

    const report = await collectReport({ github, context, core, now: new Date('2026-10-22T00:00:00Z') });

    expect(report).toMatchObject({ runs: 1, failedJobs: 1, retriedJobs: 1, failedJobsWithoutTests: 0 });
    expect(report.tests.map(test => [test.name, test.runs.size, test.retriedRuns.size])).toEqual([
      ['flaky.test.ts › also works', 1, 1],
      ['flaky.test.ts › breaks', 1, 0],
      ['flaky.test.ts › works', 1, 1],
    ]);
  });

  it('tells apart identically named tests of different apps in the same job', async () => {
    const flakyVariantPath = '../../_temp/e2e/nextjs-16-turbopack/tests/flaky.test.ts';
    const github = createGithub(
      [{ id: 40, event: 'push', conclusion: 'failure', run_attempt: 1 }],
      {
        40: [job(400, 'E2E nextjs-16, nextjs-16 (turbopack) Test', 'failure', ['Run E2E test', FLAKY_STEP_NAME])],
      },
      {
        400: [
          annotation(flakyPath, '[chromium] › flaky.test.ts:3:5 › works'),
          annotation(flakyVariantPath, '[chromium] › flaky.test.ts:3:5 › works'),
          flakyAnnotation(flakyVariantPath, '[chromium] › flaky.test.ts:3:5 › works'),
        ],
      },
    );

    const report = await collectReport({ github, context, core, now: new Date('2026-10-22T00:00:00Z') });

    expect(report.tests.map(test => [test.path, test.name, test.runs.size, test.retriedRuns.size])).toEqual([
      [flakyVariantPath, 'flaky.test.ts › works', 1, 1],
      [flakyPath, 'flaky.test.ts › works', 1, 0],
    ]);
  });

  it('does not inspect a passing job without tests that passed on retry', async () => {
    const github = createGithub(
      [{ id: 30, event: 'push', conclusion: 'success', run_attempt: 1 }],
      { 30: [job(300, 'E2E astro-4 Test', 'success', ['Run E2E test'])] },
      {},
    );

    const report = await collectReport({ github, context, core, now: new Date('2026-10-22T00:00:00Z') });

    expect(github.paginate).not.toHaveBeenCalledWith(github.rest.checks.listAnnotations, expect.anything());
    expect(report).toMatchObject({ failedJobs: 0, retriedJobs: 0, tests: [] });
  });
});
