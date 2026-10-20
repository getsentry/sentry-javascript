import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Start MySQL, MongoDB, and Redis via Docker Compose. `--wait` blocks until the
  // healthchecks in docker-compose.yml pass, so the app can connect immediately.
  try {
    execSync('docker compose up -d --wait', {
      cwd: __dirname,
      stdio: 'inherit',
    });
  } catch (error) {
    execSync('docker compose logs --tail 50', { cwd: __dirname, stdio: 'inherit' });
    throw error;
  }
}
