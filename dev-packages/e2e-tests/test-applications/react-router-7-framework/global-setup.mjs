import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Boot Redis here (rather than in the `start` script) so the cold `redis:8` image
// pull happens outside Playwright's webServer startup-timeout window. `--wait`
// blocks until the healthcheck passes;
export default async function globalSetup() {
  execSync('docker compose up -d --wait', { cwd: __dirname, stdio: 'inherit' });
}
