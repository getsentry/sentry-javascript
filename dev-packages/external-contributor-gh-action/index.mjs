import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';

const UNRELEASED_HEADING = `## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott
`;

const contributorMessageRegex = /Work in this release was contributed by (.+)\. Thank you for your contributions?!/;

async function run() {
  const { getInput } = core;

  const name = getInput('name');

  if (!name) {
    return;
  }

  const ghUserName = name.startsWith('@') ? name : `@${name}`;

  const cwd = process.cwd();
  const changelogFilePath = path.resolve(cwd, 'CHANGELOG.md');

  const changelogStr = await fs.readFile(changelogFilePath, 'utf8');

  // Find the unreleased section
  const start = changelogStr.indexOf(UNRELEASED_HEADING) + UNRELEASED_HEADING.length;
  const end = changelogStr.slice(start).indexOf('## ');

  const inBetween = changelogStr.slice(start, start + end);

  const existing = contributorMessageRegex.exec(inBetween);

  // If the contributor message already exists, add the new contributor to the list
  if (existing) {
    const users = existing[1].split(/,? and |, /);
    if (!users.includes(ghUserName)) {
      users.push(ghUserName);
    }

    const formatter = new Intl.ListFormat('en', {
      style: 'long',
      type: 'conjunction',
    });

    const newContributors = formatter.format(users);
    const newChangelog = changelogStr.replace(
      contributorMessageRegex,
      `Work in this release was contributed by ${newContributors}. Thank you for your contributions!`,
    );

    fs.writeFile(changelogFilePath, newChangelog);

    // eslint-disable-next-line no-console
    console.log('Added contributor to list of existing contributors.');
    return;
  }

  // If the contributor message does not exist, add it
  const newChangelog = changelogStr.replace(
    UNRELEASED_HEADING,
    `${UNRELEASED_HEADING}\nWork in this release was contributed by ${ghUserName}. Thank you for your contribution!\n`,
  );
  fs.writeFile(changelogFilePath, newChangelog);

  // eslint-disable-next-line no-console
  console.log('Added contributor message.');
}

run();
