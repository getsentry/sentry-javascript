import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workflow = load(readFileSync('.github/workflows/size-check-label.yml', 'utf8')) as {
  jobs: { rerun: { steps: { with: { script: string } }[] } };
};
const script = workflow.jobs.rerun.steps[0]!.with.script;
const repo = { owner: 'getsentry', repo: 'sentry-javascript' };
const context = {
  repo,
  payload: {
    pull_request: {
      number: 21813,
      head: { sha: 'current-head', ref: 'feat/bundle-size', repo: { full_name: 'contributor/sentry-javascript' } },
    },
  },
};
const github = {
  paginate: vi.fn(),
  rest: {
    pulls: { get: vi.fn() },
    actions: {
      listWorkflowRuns: vi.fn(),
      listJobsForWorkflowRun: vi.fn(),
      getWorkflowRun: vi.fn(),
      reRunJobForWorkflowRun: vi.fn(),
    },
  },
};
const core = { info: vi.fn() };
const run = {
  id: 10,
  head_repository: { full_name: 'contributor/sentry-javascript' },
  head_branch: 'feat/bundle-size',
};

async function trigger(): Promise<void> {
  await runInNewContext(`(async () => { ${script} })()`, { github, context, core, setTimeout });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  github.paginate
    .mockResolvedValueOnce([run])
    .mockResolvedValueOnce([{ id: 20, name: 'Size Check', conclusion: 'failure' }]);
  github.rest.actions.getWorkflowRun.mockResolvedValue({ data: { status: 'completed' } });
  github.rest.pulls.get.mockResolvedValue({ data: { state: 'open', head: { sha: 'current-head' } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('label-triggered size check', () => {
  it('reruns the size job for the current PR head, including fork PRs', async () => {
    await trigger();

    expect(github.paginate).toHaveBeenCalledWith(github.rest.actions.listWorkflowRuns, {
      ...repo,
      workflow_id: 'build.yml',
      event: 'pull_request',
      head_sha: 'current-head',
      per_page: 100,
    });
    expect(github.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({ ...repo, job_id: 20 });
  });

  it('chooses the newest matching run and excludes other repositories and branches', async () => {
    github.paginate.mockReset();
    github.paginate
      .mockResolvedValueOnce([
        run,
        { ...run, id: 11 },
        { ...run, id: 12, head_repository: { full_name: 'someone-else/sentry-javascript' } },
        { ...run, id: 13, head_branch: 'feat/other' },
      ])
      .mockResolvedValueOnce([{ id: 21, name: 'Size Check', conclusion: 'failure' }]);

    await trigger();

    expect(github.rest.actions.getWorkflowRun).toHaveBeenCalledWith({ ...repo, run_id: 11 });
    expect(github.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({ ...repo, job_id: 21 });
  });

  it('reruns a successful size job too, so label removal restores enforcement', async () => {
    github.paginate.mockReset();
    github.paginate
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([{ id: 20, name: 'Size Check', conclusion: 'success' }]);

    await trigger();

    expect(github.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({ ...repo, job_id: 20 });
  });

  it('waits for the existing workflow to finish before requesting a rerun', async () => {
    github.rest.actions.getWorkflowRun.mockResolvedValueOnce({ data: { status: 'in_progress' } });
    vi.useFakeTimers();

    const result = trigger();
    await vi.advanceTimersByTimeAsync(30_000);
    await result;

    expect(github.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(github.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({ ...repo, job_id: 20 });
  });

  it('does not rerun another branch when no matching run exists', async () => {
    github.paginate.mockReset();
    github.paginate.mockResolvedValueOnce([]);

    await trigger();

    expect(github.rest.actions.reRunJobForWorkflowRun).not.toHaveBeenCalled();
  });

  it('does not rerun a skipped size check', async () => {
    github.paginate.mockReset();
    github.paginate
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([{ id: 20, name: 'Size Check', conclusion: 'skipped' }]);

    await trigger();

    expect(github.rest.actions.reRunJobForWorkflowRun).not.toHaveBeenCalled();
  });

  it('does not rerun an old commit after a new push while waiting', async () => {
    github.rest.pulls.get.mockResolvedValue({ data: { state: 'open', head: { sha: 'new-head' } } });

    await trigger();

    expect(github.rest.actions.reRunJobForWorkflowRun).not.toHaveBeenCalled();
  });
});
