import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Clean up any leftover containers from previous runs
  execSync('docker compose down --volumes', {
    cwd: __dirname,
    stdio: 'inherit',
  });

  // Start Redis via Docker Compose
  execSync('docker compose up -d --wait', {
    cwd: __dirname,
    stdio: 'inherit',
  });
}
