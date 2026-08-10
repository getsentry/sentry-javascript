import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // `--wait` blocks until the healthcheck passes, so the first request can connect.
  execSync('docker compose up -d --wait', {
    cwd: __dirname,
    stdio: 'inherit',
  });
}
