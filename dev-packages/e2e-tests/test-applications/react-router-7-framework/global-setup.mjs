import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Boot Redis here (rather than in the `start` script) so the cold `redis:8` image
// pull happens outside Playwright's webServer startup-timeout window. `--wait`
// blocks until the healthcheck passes;
export default async function globalSetup() {
  // Each run copies this app to a fresh temp dir, so `docker compose` doesn't
  // recognize a leftover container from a previous (e.g. interrupted) run as
  // part of the same project - but the container name is fixed, so the daemon
  // still refuses to create a new one. Force-remove any stale leftover first.
  try {
    execSync('docker rm -f e2e-tests-react-router-7-redis', { stdio: 'ignore' });
  } catch {
    // no stale container to remove
  }
  execSync('docker compose up -d --wait', { cwd: __dirname, stdio: 'inherit' });
}
