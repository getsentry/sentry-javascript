import * as childProcess from 'child_process';

/** Grabs the current git sha */
export function getGitRevision(): string | undefined {
  let gitRevision: string | undefined;
  try {
    gitRevision = childProcess
      .execSync('git rev-parse HEAD', { stdio: ['ignore', 'ignore', 'ignore'] })
      .toString()
      .trim();
  } catch (e) {
    // noop
  }
  return gitRevision;
}
