import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  setFailed: vi.fn(),
  summary: { addRaw: vi.fn(), write: vi.fn() },
  exec: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  uploadArtifact: vi.fn(),
  getArtifacts: vi.fn(),
  context: {
    repo: { owner: 'getsentry', repo: 'sentry-javascript' },
    payload: { pull_request: { number: 21813, labels: [] as { name: string }[] } },
  },
  octokit: {
    rest: {
      pulls: { get: vi.fn() },
      issues: { listComments: vi.fn(), createComment: vi.fn(), updateComment: vi.fn() },
      actions: { downloadArtifact: vi.fn() },
    },
  },
}));

vi.mock('node:fs', () => ({ promises: { readFile: mocks.readFile, writeFile: mocks.writeFile } }));
vi.mock('@actions/core', () => ({
  getInput: mocks.getInput,
  setFailed: mocks.setFailed,
  summary: mocks.summary,
  startGroup: vi.fn(),
  endGroup: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('@actions/github', () => ({ context: mocks.context, getOctokit: () => mocks.octokit }));
vi.mock('@actions/exec', () => ({ exec: mocks.exec }));
vi.mock('@actions/io', () => ({ mkdirP: vi.fn() }));
vi.mock('@actions/glob', () => ({ create: () => ({ glob: () => ['size-limit-results.json'] }) }));
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: class {
    uploadArtifact = mocks.uploadArtifact;
  },
}));
vi.mock('../dev-packages/size-limit-gh-action/utils/getArtifactsForBranchAndWorkflow.mjs', () => ({
  getArtifactsForBranchAndWorkflow: mocks.getArtifacts,
}));

const overrideLabel = { name: 'Accept Bundlesize Increase' };
const baseline = { '@sentry/browser': { name: '@sentry/browser', size: 30_000, passed: true, sizeLimit: 34_000 } };

function measure(size: number, status = 0): void {
  mocks.exec.mockImplementation(async (command, _args, options) => {
    if (command === 'yarn run --silent size-limit --json') {
      options.listeners.stdout(Buffer.from(JSON.stringify([{ name: '@sentry/browser', size }])));
      return status;
    }
    return 0;
  });
}

async function runAction(): Promise<void> {
  await import('../dev-packages/size-limit-gh-action/index.mjs');
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.resetModules();
  mocks.context.payload.pull_request.labels = [];
  mocks.getInput.mockImplementation(name => (name === 'comparison_branch' ? 'develop' : ''));
  mocks.readFile.mockResolvedValue(JSON.stringify(baseline));
  mocks.summary.addRaw.mockReturnValue(mocks.summary);
  mocks.octokit.rest.pulls.get.mockResolvedValue({ data: { labels: [] } });
  mocks.octokit.rest.issues.listComments.mockResolvedValue({ data: [] });
  mocks.octokit.rest.actions.downloadArtifact.mockResolvedValue({ url: 'https://example.com/baseline.zip' });
  mocks.getArtifacts.mockResolvedValue({
    artifact: { id: 1 },
    workflowRun: { html_url: 'https://github.com/getsentry/sentry-javascript/actions/runs/1' },
    isLatest: true,
  });
  measure(30_501);
});

describe('size check action', () => {
  it('fails excessive growth and reports the bundle and override label', async () => {
    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledWith(
      'Gzipped bundles increased by more than 500 bytes:\n@sentry/browser: +501 bytes\n' +
        'Apply "Accept Bundlesize Increase" to acknowledge the increase.',
    );
    expect(mocks.octokit.rest.issues.createComment).toHaveBeenCalledOnce();
    expect(mocks.summary.write).toHaveBeenCalledOnce();
  });

  it('accepts a label added after the original event and still posts the report', async () => {
    mocks.octokit.rest.pulls.get.mockResolvedValue({ data: { labels: [overrideLabel] } });

    await runAction();

    expect(mocks.octokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'getsentry',
      repo: 'sentry-javascript',
      pull_number: 21813,
    });
    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining('Bundle size increase acknowledged by "Accept Bundlesize Increase".'),
    );
    expect(mocks.octokit.rest.issues.createComment).toHaveBeenCalledOnce();
  });

  it('enforces growth again when the label has been removed since the original event', async () => {
    mocks.context.payload.pull_request.labels = [overrideLabel];

    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledOnce();
  });

  it('updates the report even when bundle sizes have not changed', async () => {
    measure(30_000);
    mocks.octokit.rest.issues.listComments.mockResolvedValue({
      data: [{ id: 2, body: '## size-limit report 📦 previous report' }],
    });

    await runAction();

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.octokit.rest.issues.updateComment).toHaveBeenCalledOnce();
    expect(mocks.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('fails missing baselines even with the override label and still reports measured sizes', async () => {
    mocks.getArtifacts.mockResolvedValue(null);
    mocks.octokit.rest.pulls.get.mockResolvedValue({ data: { labels: [overrideLabel] } });

    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledWith(
      'No baseline size measurements found. Re-run after the base build completes.',
    );
    expect(mocks.octokit.rest.issues.createComment).toHaveBeenCalledOnce();
  });

  it('does not allow the label to hide measurement failures', async () => {
    measure(30_501, 1);
    mocks.octokit.rest.pulls.get.mockResolvedValue({ data: { labels: [overrideLabel] } });

    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledWith('Bundle size measurement failed.');
  });

  it('keeps enforcing growth if a fork cannot post a comment', async () => {
    mocks.octokit.rest.issues.createComment.mockRejectedValue(new Error('Forbidden'));

    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('@sentry/browser: +501 bytes'));
    expect(mocks.summary.write).toHaveBeenCalledOnce();
  });

  it('saves absolute measurements for baseline comparisons and release reports', async () => {
    mocks.getInput.mockReturnValue('');
    const artifactDirectory = path.resolve(__dirname, '../dev-packages/size-limit-gh-action');

    await runAction();

    expect(mocks.writeFile).toHaveBeenCalledWith(
      path.join(artifactDirectory, 'size-limit-results.json'),
      JSON.stringify({ '@sentry/browser': { name: '@sentry/browser', size: 30_501 } }),
      'utf8',
    );
    expect(mocks.uploadArtifact).toHaveBeenCalledWith(
      'size-limit-action',
      ['size-limit-results.json'],
      artifactDirectory,
    );
    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.octokit.rest.pulls.get).not.toHaveBeenCalled();
  });

  it('does not upload a baseline when measurement fails', async () => {
    mocks.getInput.mockReturnValue('');
    measure(30_501, 1);

    await runAction();

    expect(mocks.setFailed).toHaveBeenCalledWith('Bundle size measurement failed.');
    expect(mocks.uploadArtifact).not.toHaveBeenCalled();
  });
});
