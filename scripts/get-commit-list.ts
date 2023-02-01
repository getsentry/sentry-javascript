import { execSync } from 'child_process';

function run(): void {
  const commits = execSync('git log --format="- %s"').toString().split('\n');

  const lastReleasePos = commits.findIndex(commit => commit.includes("Merge branch 'release"));

  const newCommits = commits.splice(0, lastReleasePos).filter(commit => {
    // Filter out master/develop merges
    if (/Merge pull request #(\d+) from getsentry\/(master|develop)/.test(commit)) {
      return false;
    }

    return true;
  });

  newCommits.sort((a, b) => a.localeCompare(b));

  // eslint-disable-next-line no-console
  console.log(newCommits.join('\n'));
}

run();
