import * as childProcess from 'child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { getGitRevision } from '../../src/config/withSentryConfig/buildTime';

vi.mock('child_process', { spy: true });

afterEach(() => {
  vi.clearAllMocks();
});

it('hides the console when detecting the git revision', () => {
  const revision = '4316c2634a5f3de43cbd63780117d9221a23e3cd';
  const execSpy = vi.mocked(childProcess.execSync).mockReturnValueOnce(Buffer.from(`${revision}\n`));

  expect(getGitRevision()).toBe(revision);
  expect(execSpy).toHaveBeenCalledWith('git rev-parse HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
});
