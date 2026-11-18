import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Boot MySQL and Redis here (rather than in the `start` script) so the cold
// image pulls happen outside Playwright's webServer startup-timeout window.
// `--wait` blocks until the healthchecks in docker-compose.yml pass, so the app
// can connect immediately.
export default async function globalSetup() {
  execSync('docker compose up -d --wait', { cwd: __dirname, stdio: 'inherit' });
}
