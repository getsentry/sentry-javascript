import { execSync } from 'child_process';

const ISSUE_URL = 'https://github.com/getsentry/sentry-javascript/pull/';

export function getNewGitCommits(): string[] {
  const commits = execSync('git log --format="- %s"').toString().split('\n');

  const lastReleasePos = commits.findIndex(commit => /- meta\(changelog\)/i.test(commit));

  const newCommits = commits.splice(0, lastReleasePos).filter(commit => {
    // Filter out merge commits
    if (/Merge pull request/.test(commit)) {
      return false;
    }
    // Filter release branch merged
    if (/Merge branch/.test(commit)) {
      return false;
    }
    // Filter release commit itself
    if (/release:/.test(commit)) {
      return false;
    }

    return true;
  });

  newCommits.sort((a, b) => a.localeCompare(b));

  return newCommits.map(commit => commit.replace(/#(\d+)/, `[#$1](${ISSUE_URL}$1)`));
}

function run(): void {
  // eslint-disable-next-line no-console
  console.log(getNewGitCommits().join('\n'));
}

// Only run when executed directly, not when imported
if (require.main === module) {
  run();
}
