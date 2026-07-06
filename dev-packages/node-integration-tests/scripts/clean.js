const { execSync } = require('child_process');

// The runner (utils/runner/createRunner.ts) starts each suite's docker compose
// stack under a project name prefixed with `sentry-it-`, derived by hashing the
// working directory. Some suites (e.g. the Prisma tests) run from a temporary
// directory whose path — and therefore whose derived project name — isn't known
// ahead of time and no longer exists on disk by the time this script runs (the
// `clean` npm script removes `tmp_*` dirs first). Reconstructing project names
// from compose file paths therefore misses those stacks and leaks containers.
//
// Instead, ask Docker for every `sentry-it-*` project it still knows about and
// tear those down by name. `docker compose -p <name> down` operates purely from
// the containers' labels, so it succeeds even when the original compose file is
// gone.
const PROJECT_PREFIX = 'sentry-it-';

// eslint-disable-next-line no-console
console.log('Cleaning up docker containers and volumes...');

function listSentryProjects() {
  let output;
  try {
    output = execSync('docker compose ls --all --format json', { encoding: 'utf8' });
  } catch {
    return [];
  }

  let projects;
  try {
    projects = JSON.parse(output);
  } catch {
    return [];
  }

  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map(project => project && project.Name)
    .filter(name => typeof name === 'string' && name.startsWith(PROJECT_PREFIX));
}

for (const name of listSentryProjects()) {
  try {
    // eslint-disable-next-line no-console
    console.log(`docker compose -p ${name} down --volumes`);
    execSync(`docker compose -p ${name} down --volumes`, { stdio: 'inherit' });
  } catch {
    //
  }
}
