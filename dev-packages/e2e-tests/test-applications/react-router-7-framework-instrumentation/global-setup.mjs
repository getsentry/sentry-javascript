import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Each run copies this app to a fresh temp dir, so `docker compose` doesn't
  // recognize a leftover container from a previous (e.g. interrupted) run as
  // part of the same project - but the container names are fixed, so the daemon
  // still refuses to create new ones. Force-remove any stale leftovers first.
  for (const container of [
    'e2e-tests-react-router-7-instrumentation-redis',
    'e2e-tests-react-router-7-instrumentation-mysql',
  ]) {
    try {
      execSync(`docker rm -f ${container}`, { stdio: 'ignore' });
    } catch {
      // no stale container to remove
    }
  }
  execSync('docker compose up -d --wait', { cwd: __dirname, stdio: 'inherit' });
}
