import { describe, expect, it, vi } from 'vitest';
import { collectReport, renderReport } from './weekly-flaky-tests.mjs';

const context = { repo: { owner: 'getsentry', repo: 'sentry-javascript' } };
const now = new Date('2026-09-24T12:00:00Z');
const testPath = 'suites/tracing/http-timings/test.ts';
const testTitle = `${testPath} › adds HTTP timing`;

function workflowRun(id: number, overrides = {}) {
  return { id, event: 'push', conclusion: 'failure', run_attempt: 1, ...overrides };
}

function job(id: number, overrides = {}) {
  return {
    id,
    name: 'Playwright esm (1/4) Tests',
    conclusion: 'failure',
    head_sha: `commit-${id}`,
    run_attempt: 1,
    check_run_url: `https://api.github.com/repos/getsentry/sentry-javascript/check-runs/${id + 1000}`,
    html_url: `https://github.com/getsentry/sentry-javascript/actions/runs/1/job/${id}`,
    ...overrides,
  };
}

function annotation(overrides = {}) {
  return {
    annotation_level: 'failure',
    path: testPath,
    title: `[chromium] › ${testPath}:6:11 › adds HTTP timing`,
    ...overrides,
  };
}

function githubFixture({
  runs = [workflowRun(1), workflowRun(2), workflowRun(3)],
  jobs = { 1: [job(1)], 2: [job(2)], 3: [job(3)] },
  annotations = {},
}: {
  runs?: ReturnType<typeof workflowRun>[];
  jobs?: Record<number, ReturnType<typeof job>[]>;
  annotations?: Record<number, ReturnType<typeof annotation>[] | Error>;
} = {}) {
  const listWorkflowRuns = vi.fn();
  const listJobsForWorkflowRun = vi.fn();
  const listAnnotations = vi.fn();
  const paginate = vi.fn(async (endpoint, params) => {
    if (endpoint === listWorkflowRuns) {
      return runs;
    }
    if (endpoint === listJobsForWorkflowRun) {
      return jobs[params.run_id] || [];
    }
    if (endpoint === listAnnotations) {
      const result = annotations[params.check_run_id] || [annotation()];
      if (result instanceof Error) {
        throw result;
      }
      return result;
    }
    throw new Error('Unexpected endpoint');
  });
  return { paginate, rest: { actions: { listWorkflowRuns, listJobsForWorkflowRun }, checks: { listAnnotations } } };
}

describe('collectReport', () => {
  it('counts a test once per run across matrix variants, duplicate annotations and attempts', async () => {
    const github = githubFixture({
      jobs: {
        1: [
          job(1),
          job(11, { name: 'Playwright bundle_tracing_replay webkit Tests', head_sha: 'commit-1' }),
          job(12, { run_attempt: 2, head_sha: 'commit-1' }),
        ],
        2: [job(2)],
        3: [job(3)],
      },
      annotations: {
        1001: [annotation(), annotation()],
        1011: [annotation({ title: `[webkit] › ${testPath}:90:11 › adds HTTP timing` })],
      },
    });

    const report = await collectReport({ github, context, now });

    expect(report.tests).toEqual([
      {
        family: 'Playwright Tests',
        path: testPath,
        name: testTitle,
        runs: 3,
        recoveredRuns: 0,
        examples: [job(1).html_url, job(2).html_url, job(3).html_url],
      },
    ]);
    expect(github.paginate).toHaveBeenCalledWith(github.rest.actions.listWorkflowRuns, {
      ...context.repo,
      workflow_id: 'build.yml',
      branch: 'develop',
      created: '2026-09-17T12:00:00.000Z..2026-09-24T12:00:00.000Z',
      per_page: 100,
    });
    expect(github.paginate).toHaveBeenCalledWith(github.rest.checks.listAnnotations, {
      ...context.repo,
      check_run_id: 1001,
      per_page: 100,
    });
  });

  it('includes failures hidden by successful reruns and only credits recovery of the same matrix job and SHA', async () => {
    const github = githubFixture({
      runs: [workflowRun(1, { conclusion: 'success', run_attempt: 2 }), workflowRun(2), workflowRun(3)],
      jobs: {
        1: [job(1), job(11, { conclusion: 'success', run_attempt: 2, head_sha: 'commit-1' })],
        2: [job(2), job(22, { conclusion: 'success', run_attempt: 2, head_sha: 'different-commit' })],
        3: [
          job(3),
          job(33, { conclusion: 'success', run_attempt: 2, head_sha: 'commit-3', name: 'Playwright bundle Tests' }),
        ],
      },
    });

    const report = await collectReport({ github, context, now });

    expect(report.tests).toHaveLength(1);
    expect(report.tests[0].runs).toBe(3);
    expect(report.tests[0].recoveredRuns).toBe(1);
    expect(github.paginate).toHaveBeenCalledWith(github.rest.actions.listJobsForWorkflowRun, {
      ...context.repo,
      run_id: 1,
      filter: 'all',
      per_page: 100,
    });
  });

  it.each([
    { label: 'only two runs', runs: [workflowRun(1), workflowRun(2)], jobs: { 1: [job(1)], 2: [job(2)] } },
    {
      label: 'only one commit',
      runs: [workflowRun(1), workflowRun(2), workflowRun(3)],
      jobs: { 1: [job(1)], 2: [job(2, { head_sha: 'commit-1' })], 3: [job(3, { head_sha: 'commit-1' })] },
    },
  ])('includes failures affecting $label without minimum thresholds', async ({ runs, jobs }) => {
    const github = githubFixture({ runs, jobs });

    const report = await collectReport({ github, context, now });

    expect(report.tests).toHaveLength(1);
    expect(report.tests[0].runs).toBe(runs.length);
  });

  it('excludes PR runs, optional jobs and setup errors while reporting missing test annotations', async () => {
    const github = githubFixture({
      runs: [workflowRun(1, { event: 'pull_request' }), workflowRun(2), workflowRun(3)],
      jobs: { 2: [job(2, { name: 'E2E nuxt Test (optional)' })], 3: [job(3)] },
      annotations: { 1003: [annotation({ path: '.github', title: 'Process completed with exit code 1.' })] },
    });

    const report = await collectReport({ github, context, now });

    expect(report.tests).toEqual([]);
    expect(report.runs).toBe(2);
    expect(report.failedJobs).toBe(1);
    expect(report.failedJobsWithoutTests).toBe(1);
    expect(github.paginate).toHaveBeenCalledTimes(4);
  });

  it('ranks by affected runs and limits the digest to ten tests', async () => {
    const failures = Array.from({ length: 11 }, (_, index) => annotation({ title: `test ${index}` }));
    const github = githubFixture({
      runs: [workflowRun(1), workflowRun(2), workflowRun(3), workflowRun(4)],
      jobs: { 1: [job(1)], 2: [job(2)], 3: [job(3)], 4: [job(4)] },
      annotations: { 1001: failures, 1002: failures, 1003: failures, 1004: [failures[9]] },
    });

    const report = await collectReport({ github, context, now });

    expect(report.tests.map(test => [test.name, test.runs])).toEqual([
      ['test 9', 4],
      ['test 0', 3],
      ['test 1', 3],
      ['test 10', 3],
      ['test 2', 3],
      ['test 3', 3],
      ['test 4', 3],
      ['test 5', 3],
      ['test 6', 3],
      ['test 7', 3],
    ]);
    expect(report.totalTests).toBe(11);
  });

  it('reports unavailable annotations instead of silently treating the run as clean', async () => {
    const github = githubFixture({ annotations: { 1001: Object.assign(new Error('Not Found'), { status: 404 }) } });

    const report = await collectReport({ github, context, now });

    expect(report.warnings).toEqual(['Annotations unavailable for job 1 in run 1.']);
    expect(report.tests).toHaveLength(1);
    expect(report.tests[0].runs).toBe(2);
  });

  it('fails on API authorization or rate limit errors', async () => {
    const github = githubFixture({
      annotations: { 1001: Object.assign(new Error('API rate limit'), { status: 403 }) },
    });

    await expect(collectReport({ github, context, now })).rejects.toThrow('API rate limit');
  });
});

describe('renderReport', () => {
  it('escapes annotation text so it cannot break the digest table or inject HTML', async () => {
    const failure = annotation({ title: 'handles <img> | [links]\ncorrectly' });
    const github = githubFixture({ annotations: { 1001: [failure], 1002: [failure], 1003: [failure] } });
    const report = await collectReport({ github, context, now });

    const tableRows = renderReport(report)
      .split('\n')
      .filter(line => line.startsWith('| handles'));

    expect(tableRows).toEqual([
      '| handles &lt;img&gt; \\| \\[links\\] correctly | Playwright Tests | 3 | 0 | ' +
        `[1](${job(1).html_url}), [2](${job(2).html_url}), [3](${job(3).html_url}) |`,
    ]);
  });
});
