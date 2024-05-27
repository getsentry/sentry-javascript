import { execSync } from 'child_process';

function run(): void {
  const commits = execSync('git log --format="- %s"').toString().split('\n');

  const lastReleasePos = commits.findIndex(commit => /- meta(.*)changelog/i.test(commit));

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

  // eslint-disable-next-line no-console
  console.log(newCommits.join('\n'));
}

run();
