import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Start MySQL via Docker Compose. `--wait` blocks until the healthcheck
  // in docker-compose.yml passes, so the Deno app can connect immediately.
  execSync('docker compose up -d --wait', {
    cwd: __dirname,
    stdio: 'inherit',
  });
}
