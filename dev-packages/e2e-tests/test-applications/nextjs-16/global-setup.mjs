import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { startMockAiServer } from './ai-mock-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Start Postgres + Redis via Docker Compose. `--wait` blocks until the
  // healthchecks in docker-compose.yml pass, so the app can connect immediately.
  execSync('docker compose up -d --wait', {
    cwd: __dirname,
    stdio: 'inherit',
  });

  // The mock AI server runs here and not in the app, because a Worker can not start a `node:http` server. Playwright
  // runs the returned function as teardown.
  return startMockAiServer();
}
