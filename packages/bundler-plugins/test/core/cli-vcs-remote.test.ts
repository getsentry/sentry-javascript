import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SentryCliAdapter } from '../../src/core/cli';
import { normalizeUserOptions } from '../../src/core/options-mapping';

const { mockSetCommits } = vi.hoisted(() => ({ mockSetCommits: vi.fn() }));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({ release: { 'set-commits': mockSetCommits } }),
}));

describe('setCommits with release.vcsRemote', () => {
  let workDir: string;
  let previousCwd: string;
  let head: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'sentry-vcs-remote-'));
    previousCwd = process.cwd();
    process.chdir(workDir);
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: workDir }).toString().trim();
    git('init', '-q');
    git('remote', 'add', 'origin', 'https://github.com/example-org/example-app.git');
    git('remote', 'add', 'upstream', 'git@github.com:example-org/upstream-app.git');
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init');
    head = git('rev-parse', 'HEAD');
  });

  afterAll(() => {
    process.chdir(previousCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  it('links HEAD through the repository of the named remote', async () => {
    const options = normalizeUserOptions({ release: { name: '1.0.0', vcsRemote: 'upstream' } });

    await new SentryCliAdapter(options).setCommits('1.0.0', { auto: true });

    expect(mockSetCommits).toHaveBeenCalledWith({
      orgVersion: '1.0.0',
      commit: `example-org/upstream-app@${head}`,
    });
  });
});
